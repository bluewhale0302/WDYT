# WDYT

WDYT is a space to exchange questions and perspectives and build a record for self-understanding.

## Implemented

- Email sign-up and sign-in with Supabase Auth
- Browse public questions by the five initial topics, newest first
- Write questions with independent public/private visibility
- Read public answers and post an answer with its own visibility setting
- Row-level security keeps private questions and answers visible only to their owner (and a private question's owner can read its answers)
- Save questions to a personal journal; view your questions and answers; change their visibility
- Edit a profile with a private-by-default public visibility option
- React to public answers with helpful, relate, or new-perspective reactions
- Translate public answers between Korean and English; original text is retained and translations are cached separately
- Add a language and optional ISO 3166-1 alpha-2 country code to questions; filter discovery by either
- Translate public questions between Korean and English while keeping their originals intact
- Track saved questions as to-answer, answered, or revisit; compare the first and latest answers to the same question
- Block accounts and manage the blocked list; blocked users cannot see each other's public content
- Report public questions and answers; a short content excerpt is retained for moderation review
- Delete a question by hiding it publicly and replacing its text with a tombstone; answers remain available in each author's own journal
- Delete an individual answer permanently from its author's journal
- Ask new accounts to choose a preferred translation language and optional country before using the journal
- Refresh question and answer lists after submission, show the new entry immediately, and prevent duplicate submissions
- Hide reaction controls on a user's own answers and show reaction results immediately
- Review reports through a moderator-only dashboard; review outcomes record the moderator and time

## Run locally

1. Install Node.js 20.9 or newer.
2. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
3. Copy `.env.example` to `.env.local` and set the project URL and anon key from Supabase.
4. In Supabase Auth settings, configure the local site URL as `http://localhost:3000` and choose the email confirmation behavior you want.
5. Run `npm install`, then `npm run dev`, and open `http://localhost:3000`.

The browser uses only the Supabase publishable key. Never place a service-role key or translation provider key in `NEXT_PUBLIC_*` or client code. Public discovery and authenticated writes are protected by the SQL row-level policies. Re-run the complete `supabase/schema.sql` after updating this project so the latest tables, columns, and policies are applied; the script is designed to be rerun without deleting existing records.

Answer translation uses DeepL's Free API endpoint by default. Add a DeepL API key to `DEEPL_API_KEY` and the Supabase server secret to `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; both stay server-side. The API route requires a signed-in user, only translates public answers on public questions, caches translations, and limits each account to 30 new translations per 24 hours. Change `DEEPL_API_BASE_URL` to `https://api.deepl.com` for a DeepL API Pro key.

## Moderator setup

Set `MODERATOR_USER_IDS` in `.env.local` to a comma-separated list of trusted Supabase Auth user UUIDs. The moderation API verifies the signed-in user's token and checks this server-only allowlist before using the server secret to read or update reports. Never put moderator IDs or server secrets in `NEXT_PUBLIC_*`. Restart the app after changing the allowlist. Moderators can mark reports reviewed, dismissed, or actioned; these labels record a decision and do not automatically delete content or suspend accounts. A question deletion removes its original question text while preserving answers in their authors' journals.
