"""Regression tests for the protected site_origin_only workflow. No external requests."""

from contextlib import nullcontext
from email.message import Message
import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import supabase_site_origin as origin


class SiteOriginTest(unittest.TestCase):
    original = {"site_url": "http://localhost:3000", "uri_allow_list": "capacitor://localhost,https://other.test/a"}
    configured = {"site_url": origin.SITE, "uri_allow_list": original["uri_allow_list"] + "," + origin.CALLBACK}

    def test_preserves_remote_redirects_and_adds_only_account_callback(self):
        self.assertEqual(origin.auth_changes(self.original), self.configured)
        self.assertEqual(origin.auth_changes(self.configured), {})
        self.assertEqual(origin.auth_changes({**self.configured, "uri_allow_list": None}), {"uri_allow_list": origin.CALLBACK})

    def test_stops_on_conflicting_auth_site_or_unknown_schema(self):
        for remote in ({**self.original, "site_url": "https://other.test"}, {"site_url": None}):
            with self.subTest(remote=remote), self.assertRaises(SystemExit):
                origin.auth_changes(remote)

    @patch.object(origin, "management_request", return_value=[])
    @patch.object(origin, "check_cors", return_value=False)
    @patch.object(origin, "request_config")
    def test_dry_run_reads_only(self, auth, cors, edge):
        auth.return_value = self.original
        origin.sync("edge", "auth", False)
        auth.assert_called_once_with("auth", "GET")
        edge.assert_called_once_with("edge", "GET", "secrets")

    @patch.object(origin, "management_request", return_value=[{"name": "SITE_URL"}])
    @patch.object(origin, "check_cors", return_value=False)
    @patch.object(origin, "request_config")
    def test_never_overwrites_existing_edge_secret_on_conflict(self, auth, cors, edge):
        auth.return_value = self.original
        with self.assertRaisesRegex(SystemExit, "SITE_URL já existe"):
            origin.sync("edge", "auth", True)
        auth.assert_called_once_with("auth", "GET")
        edge.assert_called_once_with("edge", "GET", "secrets")

    @patch.object(origin, "management_request", return_value=[])
    @patch.object(origin, "check_cors", side_effect=[False, True])
    @patch.object(origin, "request_config")
    def test_applies_only_public_values_and_confirms_cors_and_auth(self, auth, cors, edge):
        auth.side_effect = [self.original, self.original, None, self.configured]
        origin.sync("edge", "auth", True)
        writes = [call.args for call in edge.call_args_list + auth.call_args_list if call.args[1] != "GET"]
        self.assertEqual(writes, [
            ("edge", "POST", "secrets", [{"name": "SITE_URL", "value": origin.SITE}]),
            ("auth", "PATCH", self.configured),
        ])
        self.assertEqual(cors.call_count, 2)

    @patch.object(origin, "management_request")
    @patch.object(origin, "check_cors", return_value=True)
    @patch.object(origin, "request_config")
    def test_repeated_apply_has_no_writes(self, auth, cors, edge):
        auth.return_value = self.configured
        origin.sync("edge", "auth", True)
        self.assertTrue(all(call.args[1] == "GET" for call in auth.call_args_list))
        edge.assert_not_called()

    @patch.object(origin, "check_cors", return_value=True)
    @patch.object(origin, "request_config")
    def test_stops_if_concurrent_changes_or_missing_prior_redirect_after_patch(self, auth, cors):
        unrelated_redirect = {**self.original, "uri_allow_list": "tauri://localhost"}
        lost_redirect = {**self.configured, "uri_allow_list": origin.CALLBACK}
        auth.side_effect = [self.original, unrelated_redirect]
        with self.assertRaisesRegex(SystemExit, "mudou"):
            origin.sync("edge", "auth", True)
        self.assertTrue(all(call.args[1] == "GET" for call in auth.call_args_list))
        auth.side_effect = [self.original, self.original, None, lost_redirect]
        with self.assertRaisesRegex(SystemExit, "releitura"):
            origin.sync("edge", "auth", True)

    @patch.object(origin.OPENER, "open")
    def test_preflight_uses_both_functions_native_web_and_denied_origin(self, request):
        visited = set()
        override = {}

        def response(req, timeout):
            self.assertEqual(req.method, "OPTIONS")
            site = req.get_header("Origin")
            visited.add((req.full_url.rsplit("/", 1)[-1], site))
            headers = Message()
            headers["Vary"] = "Accept-Encoding, Origin"
            headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
            headers["Access-Control-Allow-Headers"] = ", ".join(origin.CLIENT_HEADERS)
            grant = override.get(site, site if site != origin.DENIED else None)
            if grant is not None:
                headers["Access-Control-Allow-Origin"] = grant
            return nullcontext(SimpleNamespace(headers=headers, status=204))

        request.side_effect = response
        self.assertTrue(origin.check_cors())
        self.assertEqual(visited, {(fn, site) for fn in ("account-export", "account-delete")
                                   for site in (origin.SITE, *origin.NATIVE, origin.DENIED)})
        override[origin.SITE] = None
        self.assertFalse(origin.check_cors())
        override[origin.DENIED] = "*"
        with self.assertRaisesRegex(SystemExit, "externa"):
            origin.check_cors()
        override.clear()
        override[origin.NATIVE[0]] = None
        with self.assertRaisesRegex(SystemExit, "CORS esperado"):
            origin.check_cors()
