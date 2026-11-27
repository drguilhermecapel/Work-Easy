#!/usr/bin/env python3
"""Sync WorkEasy email OTP settings and optionally provision the Auth sender."""

import argparse
import os
import smtplib
import ssl
from email.errors import HeaderParseError
from email.headerregistry import Address
from pathlib import Path
import tomllib
from supabase_management import PRODUCTION_PROJECT, request_config

WEB = Path(__file__).resolve().parents[1]


def expected_mailer_config(sync_otp_length=False):
    with (WEB / "supabase/config.toml").open("rb") as source:
        email = tomllib.load(source)["auth"]["email"]

    result = {}
    if sync_otp_length:
        result["mailer_otp_length"] = email["otp_length"]
    for name in ("confirmation", "magic_link"):
        template = email["template"][name]
        content = (WEB / template["content_path"]).read_text(encoding="utf-8")
        if "{{ .Token }}" not in content:
            raise SystemExit(f"O modelo {name} precisa incluir o código de acesso.")
        result[f"mailer_subjects_{name}"] = template["subject"]
        result[f"mailer_templates_{name}_content"] = content
    return result


def sender_settings(remote, require_sender=False, existing_only=False):
    if remote.get("hook_send_email_enabled"):
        return None
    if remote.get("smtp_host") or remote.get("smtp_user"):
        if require_sender and not all(remote.get(field) for field in ("smtp_host", "smtp_admin_email")):
            raise SystemExit("O SMTP existente está incompleto. Confira o remetente no painel do Supabase.")
        return None
    if require_sender and existing_only:
        raise SystemExit("O login precisa de SMTP próprio ou de um Send Email Hook ativo.")
    key = os.environ.get("SUPABASE_AUTH_RESEND_KEY", "")
    sender = os.environ.get("SUPABASE_AUTH_EMAIL_FROM", "")
    if not (key or sender) and not require_sender:
        return None
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
    return {
        "smtp_host": host, "smtp_port": "465", "smtp_user": "resend", "smtp_pass": key,
        "smtp_admin_email": address.addr_spec, "smtp_sender_name": "WorkEasy",
    }


def provision_sender(token, remote):
    settings = sender_settings(remote, require_sender=True)
    if not settings:
        return
    request_config(token, "PATCH", settings)
    actual = request_config(token, "GET")
    if (actual.get("smtp_host") != settings["smtp_host"]
            or actual.get("smtp_admin_email") != settings["smtp_admin_email"]):
        raise SystemExit("A releitura do Supabase não confirmou o remetente SMTP de Auth.")
    print("Remetente SMTP de Auth configurado e conferido.")


def sync_templates(
    token, apply, verify=False, configure_sender=False, check_sender=False, *, sync_otp_length=False
):
    expected = expected_mailer_config(sync_otp_length)
    remote = request_config(token, "GET")
    print("SMTP de Auth configurado:", "sim" if remote.get("smtp_host") else "não")
    print("Send Email Hook habilitado:", "sim" if remote.get("hook_send_email_enabled") else "não")
    if check_sender:
        sender_settings(remote, require_sender=True, existing_only=verify)
    if apply and configure_sender:
        provision_sender(token, remote)
    changed = {name: value for name, value in expected.items() if remote.get(name) != value}
    if not changed:
        print("A configuração do código por e-mail corresponde ao repositório.")
        return

    print("Campos divergentes: " + ", ".join(changed))
    if verify:
        raise SystemExit("Sincronize a configuração do código por e-mail antes de publicar o site.")
    if not apply:
        print("Ensaio concluído sem alterações.")
        return

    request_config(token, "PATCH", changed)
    actual = request_config(token, "GET")
    if any(actual.get(name) != value for name, value in expected.items()):
        raise SystemExit("A releitura do Supabase não confirmou a configuração do código por e-mail.")
    print("Configuração do código por e-mail verificada no projeto de produção.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true")
    parser.add_argument("--configure-sender", action="store_true")
    parser.add_argument("--check-sender", action="store_true")
    parser.add_argument("--sync-otp-length", action="store_true", help="Inclui o tamanho do código por e-mail.")
    args = parser.parse_args()
    if args.configure_sender and not args.apply:
        parser.error("--configure-sender requer --apply")
    if os.environ.get("SUPABASE_PROJECT_ID") != PRODUCTION_PROJECT:
        raise SystemExit("SUPABASE_PROJECT_ID não corresponde à produção do WorkEasy.")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("Configure SUPABASE_ACCESS_TOKEN no ambiente protegido.")
    sync_templates(
        token,
        args.apply,
        verify=args.verify,
        configure_sender=args.configure_sender,
        check_sender=args.check_sender,
        sync_otp_length=args.sync_otp_length,
    )
