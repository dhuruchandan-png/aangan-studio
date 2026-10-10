-- Aangan Studio · Phone Enquiry Assistant · schema v1 (plain Postgres; runs on Neon)
-- Applied by `npm run db:setup`. Re-running is safe (idempotent).
-- All access goes through server routes using DATABASE_URL (the table owner). RLS is ON with no policies,
-- so any other role can read nothing. Rows are never deleted (trigger below).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- designers
create table if not exists designers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  active boolean not null default true,
  on_leave boolean not null default false,
  specialities text[] not null default '{residential,commercial}',
  rota jsonb not null default '{"days":[1,2,3,4,5,6],"start":"10:00","end":"19:00"}',
  digest_time text not null default '09:30',
  last_assigned_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- refs
create sequence if not exists enquiry_ref_seq start 1;
create sequence if not exists enquiry_sim_ref_seq start 1;
create or replace function next_enquiry_ref(sim boolean) returns text language sql set search_path = public as $$
  select case when sim then 'SIM-' || lpad(nextval('enquiry_sim_ref_seq')::text, 4, '0')
              else 'AG-'  || lpad(nextval('enquiry_ref_seq')::text, 4, '0') end
$$;

-- ---------------------------------------------------------------- enquiries
create table if not exists enquiries (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,
  channel text not null default 'phone' check (channel in ('phone','whatsapp','web')),
  caller_number text,
  caller_name text,
  first_contact_at timestamptz not null default now(),
  last_contact_at timestamptz,
  merged_call_ids uuid[] not null default '{}',
  category text check (category in ('new_enquiry','existing_client_escalation','other')),
  verdict text check (verdict in ('qualified','unsure','not_a_fit','escalate','other')),
  verdict_source text check (verdict_source in ('code','gemini')),
  priority boolean not null default false,
  priority_reason text,
  referral_name text,
  status text not null default 'new' check (status in ('new','routed','accepted','called_back','consult_booked','not_proceeding','closed')),
  callback_due_at timestamptz,
  assigned_designer_id uuid references designers(id),
  -- convenience copies so the feed is fast
  locality text,
  property_type text,
  handoff_note text,
  after_hours boolean not null default false,
  simulated boolean not null default false,
  extraction_pending boolean not null default false,
  -- ladder / reminder bookkeeping (each step happens once)
  escalated_at timestamptz,
  last_escalation_at timestamptz,
  escalation_acked_at timestamptz,
  unassigned_alert_at timestamptz,
  reminder_sent_at timestamptz,
  overdue_nudge_at timestamptz,
  overdue_fd_at timestamptz,
  missed_promise_at timestamptz,
  frontdesk_handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists enquiries_number_idx on enquiries (caller_number, last_contact_at desc);
create index if not exists enquiries_status_idx on enquiries (status, simulated);
create index if not exists enquiries_designer_idx on enquiries (assigned_designer_id, status);

-- ---------------------------------------------------------------- calls
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid references enquiries(id),
  provider text not null,
  provider_call_id text not null,
  started_at timestamptz not null,
  answered_at timestamptz,
  ring_to_answer_sec numeric,
  ended_at timestamptz,
  duration_sec integer,
  after_hours boolean not null default false,
  answered boolean not null default true,
  answered_by text check (answered_by in ('agent','front_desk')),
  transcript jsonb,
  recording_url text,
  recording_path text,
  raw_payload jsonb,
  cost_inr numeric(10,2),
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, provider_call_id)
);
create index if not exists calls_enquiry_idx on calls (enquiry_id);
create index if not exists calls_started_idx on calls (started_at desc);

-- ---------------------------------------------------------------- extractions (history kept; latest wins)
create table if not exists extractions (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id),
  fields jsonb not null,
  criteria jsonb not null,
  handoff_note text,
  still_unknown jsonb,
  existing_client jsonb,
  category text,
  suggested_verdict text,
  final_verdict text,
  verdict_mismatch boolean not null default false,
  caller_mood text,
  price_asked boolean,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_inr numeric(10,4),
  quotes_verified boolean,
  notes jsonb,
  created_at timestamptz not null default now()
);
create index if not exists extractions_enquiry_idx on extractions (enquiry_id, created_at desc);

create table if not exists compliance_flags (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id),
  enquiry_id uuid references enquiries(id),
  rule text not null,
  excerpt text not null,
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  resolved_by text,
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- handoffs
create table if not exists handoffs (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id),
  designer_id uuid not null references designers(id),
  sent_at timestamptz not null default now(),
  silent boolean not null default false,
  accepted_at timestamptz,
  accepted_via text check (accepted_via in ('dashboard')),
  passed_at timestamptz,
  pass_reason text,
  reassigned_from uuid references designers(id),
  reassigned_at timestamptz,
  nudges_sent integer not null default 0,
  last_nudge_at timestamptz,
  nudge_email_sent_at timestamptz,
  snoozed_until timestamptz,
  simulated boolean not null default false
);
create index if not exists handoffs_enquiry_idx on handoffs (enquiry_id, sent_at);
create index if not exists handoffs_designer_idx on handoffs (designer_id, sent_at desc);

-- ---------------------------------------------------------------- notifications (every message, every channel)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('designer','frontdesk','nikhil')),
  recipient_id uuid,
  enquiry_id uuid references enquiries(id),
  channel text not null check (channel in ('email','desk')),
  kind text not null check (kind in ('handoff','nudge','reassign','callback_reminder','overdue','escalation','digest','weekly','monthly','ics','compliance','summary','other')),
  payload jsonb,
  sent_at timestamptz not null default now(),
  delivered boolean not null default false,
  provider_id text,
  error text,
  simulated boolean not null default false,
  acted_at timestamptz,
  action text,
  acted_via text
);
create index if not exists notifications_enquiry_idx on notifications (enquiry_id, sent_at desc);
create index if not exists notifications_sent_idx on notifications (sent_at desc);

create table if not exists login_links (
  token_hash text primary key,
  subject text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Accountability: who did what, when, from where. One row per action or system step.
create table if not exists actions_log (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id),
  actor_type text not null check (actor_type in ('designer','admin','system')),
  actor_id uuid references designers(id),
  actor_name text not null,
  action text not null,
  detail text,
  via text,
  at timestamptz not null default now()
);
create index if not exists actions_log_enquiry_idx on actions_log (enquiry_id, at);
create index if not exists actions_log_actor_idx on actions_log (actor_id, at desc);

-- ---------------------------------------------------------------- outcomes
create table if not exists consultations (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id),
  designer_id uuid references designers(id),
  scheduled_at timestamptz not null,
  location text not null default 'site' check (location in ('site','studio')),
  ics_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists outcomes (
  enquiry_id uuid primary key references enquiries(id),
  called_back_at timestamptz,
  called_back_via text,
  consult_booked_at timestamptz,
  not_proceeding_reason text,
  not_proceeding_at timestamptz
);

-- ---------------------------------------------------------------- CRM (HubSpot) links: which HubSpot records belong to which enquiry
create table if not exists crm_links (
  enquiry_id uuid primary key references enquiries(id),
  contact_id text,
  deal_id text,
  stage_id text,
  last_event text,
  synced_at timestamptz,
  error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Gate 1
create table if not exists house_rules (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  script_text text not null,
  never_say jsonb not null,
  service_area jsonb not null,
  closing_lines jsonb not null,
  config jsonb not null,
  note text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- cost + settings + plumbing
create table if not exists cost_ledger (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  source text not null check (source in ('vaani','gemini','fixed')),
  units numeric,
  amount_inr numeric(12,4) not null,
  call_id uuid references calls(id),
  enquiry_id uuid references enquiries(id),
  simulated boolean not null default false,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cost_ledger_date_idx on cost_ledger (date);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  received_at timestamptz not null default now(),
  headers jsonb,
  body jsonb,
  processed_at timestamptz,
  error text
);

create table if not exists job_runs (
  job text not null,
  run_key text not null,
  ran_at timestamptz not null default now(),
  result jsonb,
  primary key (job, run_key)
);

-- ---------------------------------------------------------------- RLS on, no policies => server only
do $$
declare t text;
begin
  for t in select unnest(array['designers','enquiries','calls','extractions','compliance_flags','handoffs','notifications',
    'login_links','actions_log','crm_links','consultations','outcomes','house_rules','cost_ledger','app_settings','webhook_inbox','job_runs'])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- never delete rows
create or replace function forbid_delete() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Rows in % are never deleted (Aangan rule). Mark them inactive/closed instead.', tg_table_name;
end $$;

do $$
declare t text;
begin
  for t in select unnest(array['designers','enquiries','calls','extractions','compliance_flags','handoffs','notifications',
    'login_links','actions_log','crm_links','consultations','outcomes','house_rules','cost_ledger'])
  loop
    execute format('drop trigger if exists no_delete on %I', t);
    execute format('create trigger no_delete before delete on %I for each row execute function forbid_delete()', t);
  end loop;
end $$;

-- updated_at on enquiries
create or replace function touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists enquiries_touch on enquiries;
create trigger enquiries_touch before update on enquiries for each row execute function touch_updated_at();
