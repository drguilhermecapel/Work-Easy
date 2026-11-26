"""Configure the WorkEasy web origin without uploading functions or changing the database."""

import argparse
import os
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request

from supabase_management import OPENER, PRODUCTION_PROJECT, management_request, request_config

SITE = "https://workeasy.ia.br"
CALLBACK = SITE + "/conta"
NATIVE = ("capacitor://localhost", "https://localhost", "http://tauri.localhost", "tauri://localhost")
DENIED = "https://workeasy-origin-check.invalid"
CLIENT_HEADERS = {"apikey", "authorization", "content-type", "x-client-info"}


def redirect_uris(allow_list):
    return {item.strip() for item in allow_list.split(",") if item.strip()}


def auth_changes(remote):
    if not {"site_url", "uri_allow_list"}.issubset(remote):
        raise SystemExit("A API não informou a URL do site e a lista de redirecionamentos.")
    changes = {}
    site = remote["site_url"]
    if site not in (SITE, SITE + "/"):
        if site not in (None, "", "http://localhost:3000", "http://localhost:3000/"):
            raise SystemExit("A URL de Auth já aponta para outro site. Confira o domínio no painel.")
        changes["site_url"] = SITE
    redirects = remote["uri_allow_list"]
    if redirects is None:
        redirects = ""
    if not isinstance(redirects, str):
        raise SystemExit("Formato desconhecido da lista de redirecionamentos de Auth.")
    if CALLBACK not in redirect_uris(redirects):
        changes["uri_allow_list"] = redirects + ("," if redirects else "") + CALLBACK
    return changes


def header_items(response, name):
    return {item.strip().lower() for item in response.headers.get(name, "").split(",")}


def check_cors():
    """Return False only for an absent site grant. Other unexpected grants or responses are errors."""
    ready = True
    for fn in ("account-export", "account-delete"):
        for origin in (SITE, *NATIVE, DENIED):
            req = Request(f"https://{PRODUCTION_PROJECT}.supabase.co/functions/v1/{fn}", method="OPTIONS", headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": ", ".join(sorted(CLIENT_HEADERS)),
                "Cache-Control": "no-cache",
            })
            try:
                with OPENER.open(req, timeout=8) as resp:
                    grant = resp.headers.get("Access-Control-Allow-Origin")
                    if resp.status != 204 or "origin" not in header_items(resp, "Vary"):
                        raise SystemExit(f"{fn}: resposta OPTIONS inesperada.")
                    if origin == DENIED:
                        if grant is not None:
                            raise SystemExit(f"{fn}: uma origem externa recebeu permissão CORS.")
                    elif origin == SITE and grant is None:
                        ready = False
                    elif (grant != origin or "post" not in header_items(resp, "Access-Control-Allow-Methods")
                          or not CLIENT_HEADERS.issubset(header_items(resp, "Access-Control-Allow-Headers"))):
                        raise SystemExit(f"{fn}: a origem {origin} não recebeu o CORS esperado.")
            except (HTTPError, URLError, TimeoutError):
                raise SystemExit(f"{fn}: falha na consulta OPTIONS.") from None
    return ready


def require_site_unset(token):
    # The list endpoint returns metadata for all names. Only inspect existence of SITE_URL.
    entries = management_request(token, "GET", "secrets")
    if not isinstance(entries, list) or not all(isinstance(row, dict) and "name" in row for row in entries):
        raise SystemExit("A API não confirmou os nomes das variáveis de Edge Functions.")
    if any(row["name"] == "SITE_URL" for row in entries):
        raise SystemExit("SITE_URL já existe e o CORS público ainda não está correto. Confira o valor no painel.")


def sync(edge_token, auth_token, apply, verify=False):
    remote = request_config(auth_token, "GET")
    changed = auth_changes(remote)
    initial_redirects = redirect_uris(remote["uri_allow_list"] or "")
    edge_ready = check_cors()
    if not edge_ready:
        require_site_unset(edge_token)
    print("Auth:", ", ".join(changed) if changed else "origem e retorno já configurados.")
    print("Edge:", "CORS público e nativo conferido." if edge_ready else "SITE_URL ausente; criação necessária.")
    if verify and (changed or not edge_ready):
        raise SystemExit("A origem do backend requer sincronização antes de publicar o site.")
    if not apply:
        print("Conferência concluída sem escrita.")
        return
    if not edge_ready:
        # Recheck before writing, including retries after an interrupted dispatch.
        require_site_unset(edge_token)
        management_request(edge_token, "POST", "secrets", [{"name": "SITE_URL", "value": SITE}])
        for delay in (0, 2, 5, 10, 20):
            time.sleep(delay)
            if check_cors():
                break
        else:
            raise SystemExit("SITE_URL enviada. A verificação CORS ainda falha; confira a propagação antes de repetir.")
    if changed:
        current = auth_changes(request_config(auth_token, "GET"))
        if current != changed:
            raise SystemExit("A configuração de Auth mudou durante o ensaio. Repita para preservar as alterações.")
        request_config(auth_token, "PATCH", current)
    actual = request_config(auth_token, "GET")
    if auth_changes(actual) or not initial_redirects.issubset(redirect_uris(actual["uri_allow_list"] or "")):
        raise SystemExit("A releitura das URLs de Auth diverge da configuração solicitada.")
    print("URLs de Auth e CORS confirmados nas funções account-export e account-delete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if os.environ.get("SUPABASE_PROJECT_ID") != PRODUCTION_PROJECT or os.environ.get("VITE_SITE_URL") != SITE:
        raise SystemExit("Projeto ou origem protegida incompatível com a produção do WorkEasy.")
    edge_token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not edge_token:
        raise SystemExit("Configure SUPABASE_ACCESS_TOKEN no ambiente protegido.")
    sync(edge_token, os.environ.get("SUPABASE_AUTH_CONFIG_TOKEN") or edge_token, args.apply, args.verify)
