-- Age declaration as a consent purpose: the person who accepts the terms declares being 18 or older.
-- The decision is recorded in the consent history like the other purposes.

alter type public.consent_purpose add value if not exists 'age_declaration';
