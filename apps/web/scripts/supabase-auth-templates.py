#!/usr/bin/env python3
"""Compare or sync the two OTP templates without touching other Auth settings."""

import argparse
import json
import os
from pathlib import Path
import tomllib
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PRODUCTION_PROJECT = "hlzdgbxygtaklqaoihlq"
WEB = Path(__file__).resolve().parents[1]


def expected_templates():
    with (WEB / "supabase/config.toml").open("rb") as source:
        email = tomllib.load(source)["auth"]["email"]["template"]

    result = {}
    for name in ("confirmation", "magic_link"):
        template = email[name]
        content = (WEB / template["content_path"]).read_text(encoding="utf-8")
        if "{{ .Token }}" not in content:
            raise SystemExit(f"O modelo {name} precisa incluir o código de acesso.")
        result[f"mailer_subjects_{name}"] = template["subject"]
        result[f"mailer_templates_{name}_content"] = content
    return result


def request_config(token, method, payload=None):
    request = Request(
        f"https://api.supabase.com/v1/projects/{PRODUCTION_PROJECT}/config/auth",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.load(response) if method == "GET" else None
    except HTTPError as error:
        raise SystemExit(f"Supabase Management API recusou {method}: HTTP {error.code}.") from None
    except (URLError, TimeoutError, ValueError):
        raise SystemExit(f"Falha ao consultar a configuração de Auth via {method}.") from None


def sync_templates(token, apply, verify=False):
    expected = expected_templates()
    remote = request_config(token, "GET")
    changed = {name: value for name, value in expected.items() if remote.get(name) != value}
    if not changed:
        print("Os modelos de código já correspondem ao repositório.")
        return

    print("Campos divergentes: " + ", ".join(changed))
    if verify:
        raise SystemExit("Aplique os modelos de código no workflow do Supabase antes de publicar o site.")
    if not apply:
        print("Ensaio concluído sem alterações.")
        return

    request_config(token, "PATCH", changed)
    actual = request_config(token, "GET")
    if any(actual.get(name) != value for name, value in expected.items()):
        raise SystemExit("A leitura após a publicação não confirmou os modelos.")
    print("Modelos de confirmação e login verificados no projeto de produção.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if os.environ.get("SUPABASE_PROJECT_ID") != PRODUCTION_PROJECT:
        raise SystemExit("SUPABASE_PROJECT_ID não corresponde à produção do WorkEasy.")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("Configure SUPABASE_ACCESS_TOKEN no ambiente protegido.")
    sync_templates(token, args.apply, args.verify)
