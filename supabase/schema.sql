-- Run in the Supabase SQL Editor. Public reads are intentionally distinct
-- from authenticated writes; private content is protected by row-level policies.
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 160),
  body text not null default '' check (char_length(body) <= 3000),
  category text not null check (category in ('자아와 심리','인간관계','철학과 삶','사회와 미래','일상과 관심사')),
  language text not null default 'ko' check (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  country_code text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.questions add column if not exists country_code text;
alter table public.questions add column if not exists deleted_at timestamptz;
alter table public.questions drop constraint if exists questions_country_code_check;
alter table public.questions add constraint questions_country_code_check check (country_code is null or country_code ~ '^[A-Z]{2}$');

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  is_public boolean not null default true,
  language text not null default 'ko' check (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.answers add column if not exists deleted_at timestamptz;

create table if not exists public.saved_questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  saved_at timestamptz not null default now(),
  status text not null default 'to_answer' check (status in ('to_answer','answered','revisit')),
  primary key (user_id, question_id)
);

alter table public.saved_questions add column if not exists status text not null default 'to_answer';
alter table public.saved_questions drop constraint if exists saved_questions_status_check;
alter table public.saved_questions add constraint saved_questions_status_check check (status in ('to_answer','answered','revisit'));

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 50),
  bio text not null default '' check (char_length(bio) <= 240),
  is_public boolean not null default false,
  preferred_language text not null default 'en',
  country_code text,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists preferred_language text not null default 'en';
alter table public.profiles add column if not exists country_code text;
alter table public.profiles drop constraint if exists profiles_preferred_language_check;
alter table public.profiles add constraint profiles_preferred_language_check check (preferred_language in ('ko','en','ja','zh','es','fr','de','pt','ar','id'));
alter table public.profiles drop constraint if exists profiles_country_code_check;
alter table public.profiles add constraint profiles_country_code_check check (country_code is null or country_code ~ '^[A-Z]{2}$');

create table if not exists public.answer_reactions (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('helpful','relate','perspective')),
  created_at timestamptz not null default now(),
  unique (answer_id, user_id, reaction)
);

create table if not exists public.translations (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers(id) on delete cascade,
  source_language text not null,
  target_language text not null,
  translated_text text not null,
  provider text not null default 'deepl',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (answer_id, target_language)
);

create table if not exists public.question_translations (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  source_language text not null,
  target_language text not null,
  translated_title text not null,
  translated_body text not null default '',
  provider text not null default 'deepl',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (question_id, target_language)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks add column if not exists reason text not null default '';
alter table public.user_blocks drop constraint if exists user_blocks_reason_check;
alter table public.user_blocks add constraint user_blocks_reason_check check (char_length(reason) <= 500);

create table if not exists public.account_handles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('question','answer')),
  target_id uuid not null,
  content_excerpt text not null default '' check (char_length(content_excerpt) <= 5000),
  reason text not null check (reason in ('spam','harassment','hate','privacy','dangerous','other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed','actioned')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

alter table public.content_reports add column if not exists reviewed_at timestamptz;
alter table public.content_reports add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

create index if not exists questions_public_recent_idx on public.questions (created_at desc) where is_public;
create index if not exists questions_author_recent_idx on public.questions (author_id, created_at desc);
create index if not exists questions_country_recent_idx on public.questions (country_code, created_at desc) where is_public;
create index if not exists questions_language_recent_idx on public.questions (language, created_at desc) where is_public;
create index if not exists answers_question_recent_idx on public.answers (question_id, created_at desc);
create index if not exists answers_author_recent_idx on public.answers (author_id, created_at desc);
create index if not exists saved_questions_user_recent_idx on public.saved_questions (user_id, saved_at desc);
create index if not exists answer_reactions_answer_idx on public.answer_reactions (answer_id);
create index if not exists translations_answer_target_idx on public.translations (answer_id, target_language);
create index if not exists question_translations_question_target_idx on public.question_translations (question_id, target_language);
create index if not exists content_reports_status_recent_idx on public.content_reports (status, created_at desc);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);

alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.saved_questions enable row level security;
alter table public.profiles enable row level security;
alter table public.answer_reactions enable row level security;
alter table public.translations enable row level security;
alter table public.question_translations enable row level security;
alter table public.user_blocks enable row level security;
alter table public.account_handles enable row level security;
alter table public.content_reports enable row level security;

create or replace function public.is_blocked_with(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = target_user)
       or (b.blocker_id = target_user and b.blocked_id = auth.uid())
  );
$$;
revoke all on function public.is_blocked_with(uuid) from public;
grant execute on function public.is_blocked_with(uuid) to anon, authenticated;

drop policy if exists "Public questions and own private questions are readable" on public.questions;
create policy "Public questions and own private questions are readable"
  on public.questions for select to anon, authenticated
  using (
    author_id = (select auth.uid())
    or (is_public and deleted_at is null and not public.is_blocked_with(author_id))
  );

drop policy if exists "Authenticated users can create their own questions" on public.questions;
create policy "Authenticated users can create their own questions"
  on public.questions for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists "Authors can update their own questions" on public.questions;
create policy "Authors can update their own questions"
  on public.questions for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "Authors can delete their own questions" on public.questions;
create policy "Authors can delete their own questions"
  on public.questions for delete to authenticated
  using (author_id = (select auth.uid()));

drop policy if exists "Public answers on public questions and own answers are readable" on public.answers;
create policy "Public answers on public questions and own answers are readable"
  on public.answers for select to anon, authenticated
  using (
    answers.author_id = (select auth.uid())
    or exists (
      select 1 from public.questions q
      where q.id = answers.question_id and q.deleted_at is null
        and not public.is_blocked_with(answers.author_id)
        and (
          q.author_id = (select auth.uid())
          or (is_public and q.is_public and not public.is_blocked_with(q.author_id))
        )
    )
  );

drop policy if exists "Authenticated users can answer readable questions" on public.answers;
create policy "Authenticated users can answer readable questions"
  on public.answers for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.questions q
      where q.id = question_id and q.deleted_at is null
        and (q.is_public or q.author_id = (select auth.uid()))
        and not public.is_blocked_with(q.author_id)
    )
  );

drop policy if exists "Authors can update their own answers" on public.answers;
create policy "Authors can update their own answers"
  on public.answers for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "Authors can delete their own answers" on public.answers;
create policy "Authors can delete their own answers"
  on public.answers for delete to authenticated
  using (author_id = (select auth.uid()));

drop policy if exists "Users can view their own saved questions" on public.saved_questions;
create policy "Users can view their own saved questions"
  on public.saved_questions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can save public questions" on public.saved_questions;
create policy "Users can save public questions"
  on public.saved_questions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = question_id and q.is_public and q.deleted_at is null and not public.is_blocked_with(q.author_id))
  );

drop policy if exists "Users can update their saved question status" on public.saved_questions;
create policy "Users can update their saved question status"
  on public.saved_questions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove their saved questions" on public.saved_questions;
create policy "Users can remove their saved questions"
  on public.saved_questions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Public profiles and own profile are readable" on public.profiles;
create policy "Public profiles and own profile are readable"
  on public.profiles for select to anon, authenticated
  using (id = (select auth.uid()) or (is_public and not public.is_blocked_with(id)));

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Public question translations are readable" on public.question_translations;
create policy "Public question translations are readable"
  on public.question_translations for select to anon, authenticated
  using (exists (
    select 1 from public.questions q
    where q.id = question_id and q.is_public and q.deleted_at is null and not public.is_blocked_with(q.author_id)
  ));

drop policy if exists "Public reactions on public answers are readable" on public.answer_reactions;
create policy "Public reactions on public answers are readable"
  on public.answer_reactions for select to anon, authenticated
  using (exists (
    select 1 from public.answers a join public.questions q on q.id = a.question_id
    where a.id = answer_id and a.is_public and q.is_public and q.deleted_at is null
      and not public.is_blocked_with(a.author_id) and not public.is_blocked_with(q.author_id)
  ));

drop policy if exists "Signed-in users can react to others public answers" on public.answer_reactions;
create policy "Signed-in users can react to others public answers"
  on public.answer_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.answers a join public.questions q on q.id = a.question_id
      where a.id = answer_id and a.author_id <> (select auth.uid()) and a.is_public and q.is_public and q.deleted_at is null
        and not public.is_blocked_with(a.author_id) and not public.is_blocked_with(q.author_id)
    )
  );

drop policy if exists "Users can remove their own reactions" on public.answer_reactions;
create policy "Users can remove their own reactions"
  on public.answer_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Translations are readable with public answers" on public.translations;
create policy "Translations are readable with public answers"
  on public.translations for select to anon, authenticated
  using (exists (
    select 1 from public.answers a join public.questions q on q.id = a.question_id
    where a.id = answer_id and a.is_public and q.is_public and q.deleted_at is null
      and not public.is_blocked_with(a.author_id) and not public.is_blocked_with(q.author_id)
  ));

drop policy if exists "Users can store translations of public answers" on public.translations;

drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks" on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
drop policy if exists "Users can block other accounts" on public.user_blocks;
create policy "Users can block other accounts" on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()) and blocker_id <> blocked_id);
drop policy if exists "Users can unblock accounts" on public.user_blocks;
create policy "Users can unblock accounts" on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

drop policy if exists "Users can view their own reports" on public.content_reports;
create policy "Users can view their own reports" on public.content_reports
  for select to authenticated using (reporter_id = (select auth.uid()));
drop policy if exists "Users can report visible public questions" on public.content_reports;
create policy "Users can report visible public questions" on public.content_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid()) and target_type = 'question'
    and exists (select 1 from public.questions q where q.id = target_id and q.is_public and q.deleted_at is null and q.author_id <> (select auth.uid()))
  );
drop policy if exists "Users can report visible public answers" on public.content_reports;
create policy "Users can report visible public answers" on public.content_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid()) and target_type = 'answer'
    and exists (select 1 from public.answers a join public.questions q on q.id = a.question_id
      where a.id = target_id and a.is_public and q.is_public and q.deleted_at is null and a.author_id <> (select auth.uid()))
  );

revoke all on public.questions, public.answers from anon, authenticated;
grant select on public.questions, public.answers to anon, authenticated;
grant insert, update, delete on public.questions, public.answers to authenticated;
revoke all on public.saved_questions from anon, authenticated;
grant select, insert, update, delete on public.saved_questions to authenticated;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
revoke all on public.answer_reactions, public.translations, public.question_translations from anon, authenticated;
grant select on public.answer_reactions, public.translations, public.question_translations to anon, authenticated;
grant insert, delete on public.answer_reactions to authenticated;
revoke all on public.user_blocks, public.content_reports from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, insert on public.content_reports to authenticated;
revoke all on public.account_handles from anon, authenticated;
