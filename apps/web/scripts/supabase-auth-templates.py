#!/usr/bin/env python3
"""Sync OTP templates and optionally provision the configured WorkEasy Auth sender."""

import argparse
import json
import os
import smtplib
import ssl
from email.errors import HeaderParseError
from email.headerregistry import Address
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
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "WorkEasy-Release/1.0",
        },
        method=method,
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.load(response) if method == "GET" else None
    except HTTPError as error:
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
        raise SystemExit(f"Falha ao consultar a configuração de Auth via {method}.") from None


def provision_sender(token, remote):
    key = os.environ.get("SUPABASE_AUTH_RESEND_KEY", "")
    sender = os.environ.get("SUPABASE_AUTH_EMAIL_FROM", "")
    if not (key or sender):
        return
    if remote.get("smtp_host") or remote.get("smtp_user") or remote.get("hook_send_email_enabled"):
        return
    if not key or not sender:
        raise SystemExit("A configuração Resend de Auth requer SUPABASE_AUTH_RESEND_KEY e SUPABASE_AUTH_EMAIL_FROM.")
    try:
        address = Address(addr_spec=sender)
        if not address.username or "." not in address.domain or address.domain.lower() == "resend.dev":
            raise ValueError
    except (ValueError, HeaderParseError):
        raise SystemExit("Use um endereço de Auth do domínio de envio verificado.") from None
    host = "smtp.resend.com"
    try:
        with smtplib.SMTP_SSL(host, 465, timeout=20, context=ssl.create_default_context()) as smtp:
            smtp.login("resend", key)
            # Check the envelope sender without providing a recipient or sending a message.
            code, _ = smtp.mail(address.addr_spec)
            if code != 250:
                raise SystemExit("O Resend recusou o remetente de Auth.")
            smtp.rset()
    except (OSError, smtplib.SMTPException):
        raise SystemExit("Falha na conexão TLS ou na autenticação SMTP do Resend.") from None
    request_config(token, "PATCH", {
        "smtp_host": host, "smtp_port": "465", "smtp_user": "resend", "smtp_pass": key,
        "smtp_admin_email": address.addr_spec, "smtp_sender_name": "WorkEasy",
    })
    actual = request_config(token, "GET")
    if actual.get("smtp_host") != host or actual.get("smtp_admin_email") != address.addr_spec:
        raise SystemExit("A releitura do Supabase não confirmou o remetente SMTP de Auth.")
    print("Remetente SMTP de Auth configurado e conferido.")


def sync_templates(token, apply, verify=False, configure_sender=False):
    expected = expected_templates()
    remote = request_config(token, "GET")
    print("SMTP de Auth configurado:", "sim" if remote.get("smtp_host") else "não")
    print("Send Email Hook habilitado:", "sim" if remote.get("hook_send_email_enabled") else "não")
    if apply and configure_sender:
        provision_sender(token, remote)
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
    parser.add_argument("--configure-sender", action="store_true")
    args = parser.parse_args()
    if args.configure_sender and not args.apply:
        parser.error("--configure-sender requer --apply")
    if os.environ.get("SUPABASE_PROJECT_ID") != PRODUCTION_PROJECT:
        raise SystemExit("SUPABASE_PROJECT_ID não corresponde à produção do WorkEasy.")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("Configure SUPABASE_ACCESS_TOKEN no ambiente protegido.")
    sync_templates(token, args.apply, args.verify, args.configure_sender)
