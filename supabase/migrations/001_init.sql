create extension if not exists "pgcrypto";

-- ── profiles ─────────────────────────────────────────────
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  locale       text not null default 'fr',
  total_xp     int  not null default 0,
  streak_days  int  not null default 0,
  last_active  date,
  created_at   timestamptz not null default now()
);

-- ── documents ────────────────────────────────────────────
create table documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  kind           text not null check (kind in ('cv','jd')),
  storage_path   text,                    -- null for pasted JD text
  raw_text       text,                    -- pasted JD, or extracted CV text
  parsed         jsonb,                   -- structured extraction from Gemini
  created_at     timestamptz not null default now()
);
create index on documents (user_id, kind);

-- ── roadmaps ─────────────────────────────────────────────
create table roadmaps (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  cv_document_id  uuid references documents on delete set null,
  jd_document_id  uuid references documents on delete set null,
  target_role     text not null,
  company         text,
  language        text not null default 'fr' check (language in ('fr','en')),
  gap_analysis    jsonb not null,          -- see §6.1 schema
  created_at      timestamptz not null default now()
);
create index on roadmaps (user_id, created_at desc);

-- ── stages ───────────────────────────────────────────────
create table stages (
  id            uuid primary key default gen_random_uuid(),
  roadmap_id    uuid not null references roadmaps on delete cascade,
  order_index   int  not null,
  slug          text not null,             -- recruiter_screen | technical | behavioral | system_design
  title         text not null,
  description   text,
  focus_areas   jsonb not null default '[]',
  question_bank jsonb not null default '[]',
  persona       jsonb not null default '{}',  -- name, tone, strictness
  max_seconds   int  not null default 600,
  pass_score    int  not null default 60,
  unique (roadmap_id, order_index)
);

-- ── sessions ─────────────────────────────────────────────
create table sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users on delete cascade,   -- null for demo
  stage_id          uuid references stages on delete set null,      -- null for demo
  mode              text not null check (mode in ('demo','full')),
  language          text not null default 'fr',
  status            text not null default 'active'
                    check (status in ('active','completed','abandoned','errored')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  duration_seconds  int,
  ip_hash           text,                  -- sha256(ip + salt), demo rate limiting
  ttfa_ms           int,                   -- time to first audio, first turn
  resumption_handle text,
  usage             jsonb default '{}',    -- token counts reported by the API
  error             text
);
create index on sessions (user_id, started_at desc);
create index on sessions (ip_hash, started_at desc);

-- ── turns ────────────────────────────────────────────────
create table turns (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions on delete cascade,
  order_index  int  not null,
  role         text not null check (role in ('interviewer','candidate')),
  transcript   text not null default '',
  start_ms     int  not null,              -- ms since session start
  end_ms       int  not null,
  unique (session_id, order_index)
);

-- ── scorecards ───────────────────────────────────────────
create table scorecards (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null unique references sessions on delete cascade,
  overall       int  not null,             -- 0-100
  star          jsonb not null,            -- {situation, task, action, result} each 0-100
  relevance     int  not null,
  communication jsonb not null,            -- {clarity, pace_wpm, filler_rate, talk_ratio, longest_pause_ms}
  strengths     jsonb not null default '[]',
  improvements  jsonb not null default '[]',
  model_answers jsonb not null default '[]',
  xp_awarded    int  not null default 0,
  stars         int  not null default 0 check (stars between 0 and 3),
  created_at    timestamptz not null default now()
);

-- ── progress ─────────────────────────────────────────────
create table progress (
  user_id     uuid not null references auth.users on delete cascade,
  stage_id    uuid not null references stages on delete cascade,
  unlocked    boolean not null default false,
  attempts    int not null default 0,
  best_score  int,
  stars       int not null default 0,
  completed_at timestamptz,
  primary key (user_id, stage_id)
);

-- ── usage_counters (kill switch) ─────────────────────────
create table usage_counters (
  day             date primary key,
  demo_sessions   int not null default 0,
  full_sessions   int not null default 0,
  killed          boolean not null default false
);
