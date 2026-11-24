-- Consent to send text to the third-party AI service, as a purpose of its own (docs/DECISOES.md,
-- DD62). The assistants already told the user what is sent before sending; now the agreement is
-- recorded in the consent history, with the version of the text, and can be withdrawn in the
-- account page like the other optional purposes.

alter type public.consent_purpose add value if not exists 'ai_assist';
