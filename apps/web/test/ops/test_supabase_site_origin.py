"""Regression tests for the protected site_origin_only workflow. No external requests."""

from contextlib import nullcontext
from email.message import Message
import importlib.util
import os
import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import supabase_site_origin as origin

auth_spec = importlib.util.spec_from_file_location("auth_templates", Path(origin.__file__).with_name("supabase-auth-templates.py"))
auth = importlib.util.module_from_spec(auth_spec)
auth_spec.loader.exec_module(auth)


class SiteOriginTest(unittest.TestCase):
    original = {"site_url": "http://localhost:3000", "uri_allow_list": "capacitor://localhost,https://other.test/a"}
    configured = {"site_url": origin.SITE, "uri_allow_list": original["uri_allow_list"] + "," + (origin.SITE + "/conta")}

    def test_preserves_remote_redirects_and_adds_only_account_callback(self):
        self.assertEqual(origin.auth_changes(self.original), self.configured)
        self.assertEqual(origin.auth_changes(self.configured), {})
        self.assertEqual(origin.auth_changes({**self.configured, "uri_allow_list": None}), {"uri_allow_list": (origin.SITE + "/conta")})

    def test_protected_override_rejects_non_origins_and_allows_real_pages_domain(self):
        self.assertEqual(origin.public_origin("https://workeasy-app.pages.dev"), "https://workeasy-app.pages.dev")
        for invalid in ("https://example.com", "http://app.pages.dev", "https://bad.pages.dev/path",
                        "https://localhost", "https://127.0.0.1", "https://u:p@pages.dev", "https://pages.dev:443"):
            with self.subTest(value=invalid), self.assertRaises(SystemExit):
                origin.public_origin(invalid)

    @patch.object(origin, "management_request")
    @patch.object(origin, "check_cors", return_value=True)
    @patch.object(origin, "request_config")
    def test_protected_override_only_accepts_existing_auth_and_cors(self, auth, cors, edge):
        target = "https://workeasy-app.pages.dev"
        auth.return_value = {"site_url": target, "uri_allow_list": f"capacitor://localhost,{target}/conta"}
        origin.sync("edge", "auth", True, target=target)
        cors.assert_called_once_with(target)
        cors.return_value = False
        with self.assertRaisesRegex(SystemExit, "alternativa"):
            origin.sync("edge", "auth", True, target=target)
        cors.return_value = True
        auth.return_value = self.original
        with self.assertRaisesRegex(SystemExit, "alternativa"):
            origin.sync("edge", "auth", True, target=target)
        self.assertTrue(all(call.args[1] == "GET" for call in auth.call_args_list))
        edge.assert_not_called()

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
        lost_redirect = {**self.configured, "uri_allow_list": (origin.SITE + "/conta")}
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
            self.assertTrue(req.full_url.startswith(f"https://{origin.PRODUCTION_PROJECT}.supabase.co/functions/v1/"))
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


class AuthPreflightTest(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    @patch.object(auth, "request_config")
    def test_missing_sender_fails_before_writing_or_publishing(self, api):
        api.return_value = {}
        with self.assertRaisesRegex(SystemExit, "SUPABASE_AUTH_RESEND_KEY e SUPABASE_AUTH_EMAIL_FROM"):
            auth.sync_templates("test", False, check_sender=True)
        api.assert_called_once_with("test", "GET")
        with self.assertRaisesRegex(SystemExit, "SUPABASE_AUTH_RESEND_KEY e SUPABASE_AUTH_EMAIL_FROM"):
            auth.sync_templates("test", True, configure_sender=True)
        self.assertTrue(all(call.args[1] == "GET" for call in api.call_args_list))

    @patch.object(auth.smtplib, "SMTP_SSL")
    def test_existing_mailer_or_hook_passes_without_provisioning(self, smtp):
        for remote in ({"hook_send_email_enabled": True}, {"smtp_host": "mail.test", "smtp_admin_email": "test@mail.test"}):
            self.assertIsNone(auth.sender_settings(remote, require_sender=True, existing_only=True))
        smtp.assert_not_called()

    @patch.dict(os.environ, {"SUPABASE_AUTH_RESEND_KEY": "test-credential", "SUPABASE_AUTH_EMAIL_FROM": "app@example.test"})
    @patch.object(auth.smtplib, "SMTP_SSL")
    @patch.object(auth, "request_config")
    def test_plan_checks_envelope_without_sending_or_writing(self, api, smtp):
        api.return_value = {}
        connection = smtp.return_value.__enter__.return_value
        connection.mail.return_value = (250, b"OK")
        auth.sync_templates("test", False, check_sender=True)
        self.assertEqual([call[0] for call in connection.method_calls], ["login", "mail", "rset"])
        api.assert_called_once_with("test", "GET")
        with self.assertRaisesRegex(SystemExit, "SMTP próprio"):
            auth.sync_templates("test", False, verify=True, check_sender=True)
