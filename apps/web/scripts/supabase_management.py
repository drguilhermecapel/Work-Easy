"""Management API access for the protected WorkEasy production workflows."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

PRODUCTION_PROJECT = "hlzdgbxygtaklqaoihlq"


def select_auth_token(environ):
    """Choose once before any request; authentication errors never select another token."""
    source = environ.get("SUPABASE_AUTH_TOKEN_SOURCE") or "config"
    if source not in ("config", "access"):
        raise SystemExit("SUPABASE_AUTH_TOKEN_SOURCE deve ser config ou access.")
    name = "SUPABASE_ACCESS_TOKEN"
    if source == "config" and environ.get("SUPABASE_AUTH_CONFIG_TOKEN"):
        name = "SUPABASE_AUTH_CONFIG_TOKEN"
    token = environ.get(name)
    if not token:
        raise SystemExit(f"Configure {name} no ambiente protegido.")
    print(f"Credencial selecionada para Auth: {name}.")
    return token


class NoRedirect(HTTPRedirectHandler):
    """Keep production credentials and origin checks on their original endpoints."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = build_opener(NoRedirect())


def management_request(token, method, path, payload=None):
    request = Request(
        f"https://api.supabase.com/v1/projects/{PRODUCTION_PROJECT}/{path}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "WorkEasy-Release/1.0",
        },
        method=method,
    )
    try:
        with OPENER.open(request, timeout=20) as response:
            return json.load(response) if method == "GET" else None
    except HTTPError as error:
        if path != "config/auth":
            raise SystemExit(f"Supabase Management API recusou {method} {path}: HTTP {error.code}.") from None
        if error.code == 400:
            # A management response may contain configuration values. Only emit known categories.
            detail = error.read(8192).decode("utf-8", errors="replace").lower()
            if "smtp" in detail or "email provider" in detail or "email hook" in detail:
                reason = "A API indicou uma restrição relacionada ao remetente de e-mail."
            elif "template" in detail:
                reason = "A API indicou uma restrição relacionada aos modelos de e-mail."
            else:
                reason = "A API rejeitou os campos enviados."
            raise SystemExit(f"Supabase Management API recusou {method}: HTTP 400. {reason}") from None
        if error.code == 403:
            media_type = error.headers.get_content_type()
            if media_type == "text/html":
                hint = "Resposta HTML. Confira os controles de rede e a origem da resposta."
            else:
                scope = "auth:read" if method == "GET" else "auth:write"
                hint = f"Confira o acesso ao projeto WorkEasy e a autorização {scope} no Supabase."
            raise SystemExit(f"Supabase Management API recusou {method}: HTTP 403. {hint}") from None
        raise SystemExit(f"Supabase Management API recusou {method}: HTTP {error.code}.") from None
    except (URLError, TimeoutError, ValueError):
        raise SystemExit(f"Falha ao consultar {path} via {method}.") from None


def request_config(token, method, payload=None):
    return management_request(token, method, "config/auth", payload)

