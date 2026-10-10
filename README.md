# Aangan Studio · Phone Enquiry Assistant

Every call to Aangan's studio line is answered within seconds, day or night, by an AI voice agent that asks what the front desk would ask. Good leads reach a designer by email, with everything already asked, and they act on it in their own signed-in dashboard. **Prices come from a designer, never from the bot.** Nikhil gets a live dashboard of what the system generates and what it costs.

Scope: **phone calls only.** WhatsApp and the web form are out of scope, but the pipeline is channel-agnostic (see [Later channels](#later-channels)).

```
caller rings → Vaani voice agent (briefed with Nikhil-approved House Rules)
   → call saved → CODE cleans the transcript, masks card/ID numbers, merges dropped calls
   → GEMINI fills fields + judges 5 criteria against qualified.md (quoting the caller)
   → CODE checks every quote, recomputes the verdict, scans the agent's lines for price talk (the Cut)
   → CODE routes: qualified → designer on duty (email, 1-hour clock) · unsure → front-desk queue
                  not a fit → logged · existing client → Nikhil + senior chat, 15-minute clock
   → designer opens the lead from the email, signs in, taps Accept / Called back / Book on their dashboard → .ics invite
   → every action is stamped (who, what, when) in an audit trail
   → everything logged → The Courtyard shows results and cost
```

## THE CUT (non-negotiable)
The agent never quotes a price. It uses exactly one line from `pricing.md`, and nothing else about money.
- `pricing.md` is **not in this repository** and is never sent to Gemini or to the voice agent. Only its "never say" rules are used: as the never-say list and the pattern checks in `lib/pipeline/compliance.ts`.
- After every call the agent's lines are scanned for ₹ amounts, "lakh", per-sq-ft figures, "rates start at / typically costs / around", discounts and date promises. A hit raises a red **HOUSE RULE BROKEN** alert to Nikhil (email + dashboard) with the excerpt.
- Gate 1: Nikhil signs off the script, the never-say list and the service area on the **House Rules** screen before the agent goes live, and again after any change.
- Gate 2: the designer decides (Accept / Pass / Reassign), calls back, and gives any price only after seeing the site.

## What's where
| Area | Files |
|---|---|
| Voice adapter (Vaani → `CallRecord`) | `lib/voice/vaani.ts`, `app/api/voice/*` |
| Pipeline (steps A–F) | `lib/pipeline/{clean,extract,decide,compliance,run}.ts`, `lib/route.ts` |
| Notifications (one service, one log) | `lib/notify/*`, `lib/actions.ts`, `lib/ladder.ts`, `lib/digests.ts`, `lib/tick.ts` |
| Database (Neon Postgres) | `db/schema.sql`, `db/seed.sql`, `db/demo_seed.sql`, `lib/db.ts`, `scripts/db-setup.ts` |
| Dashboard | `app/(app)/*` (Courtyard, Front Door, Brief Book, Studio Roster, House Rules, Rehearsal Room), `app/me/*` (each designer's own dashboard), `app/login` + `app/auth/verify` (sign-in) |
| Voice agent config | `voice/agent-config.{md,json}` (draft; the House Rules screen exports the approved version) |
| Tests | `scripts/test-*.ts`, fixtures in `scripts/fixtures/` (parsed from the PDF by `scripts/build_fixtures.py`) |

## Deploy: step by step

### 1. Database (Neon)
1. At neon.tech create a project (region closest to Pune; Singapore works well). In **Connect**, copy the **pooled** connection string (host contains `-pooler`) into `.env.local` as `DATABASE_URL`, and the same string **without** `-pooler` as `DATABASE_URL_UNPOOLED`.
2. Create the tables and load the starter data:
   ```bash
   npm run db:setup             # 16 tables, row-level security, never-delete triggers, 14 employees, settings
   npm run db:setup -- --demo   # ...plus the 20 sample enquiries (skipped if already there)
   npm run db:test              # 11 checks of the data layer against your real database
   ```
   Safe to re-run: nothing is duplicated or deleted.
3. The app talks to Postgres through `lib/db.ts` (plain `pg`, parameterised queries, strict TLS). Rows are never deleted: a database trigger refuses it.
4. Neon's free plan sleeps the database after 5 minutes idle and wakes it in a fraction of a second, so the first request after a quiet spell is slightly slower. Because of that, the 5-minute scheduler runs **outside** the database (step 6).
5. After you have pasted a connection string anywhere other than `.env.local` (a chat, a ticket), reset the database password in Neon (Roles → reset) and update `.env.local`.

### 2. Keys, `.gitignore`, GitHub
```bash
cp .env.example .env.local      # fill it in (see the comments inside)
grep -n "env.local" .gitignore  # must show .env.local is ignored BEFORE the first push
git init && git add -A && git commit -m "Aangan phone assistant" && git branch -M main
gh repo create aangan-studio --private --source=. --push   # or push to a repo you made on github.com
```
`LINK_SIGNING_SECRET`, `CRON_SECRET`, `VAANI_WEBHOOK_SECRET` and `DASHBOARD_PASSCODE` are already generated in `.env.local`. Use a **billing-enabled** Gemini API key for real caller data: the free tier may use inputs to improve Google's models.

### 3. Vercel
The Vercel connector here is read-only, so the first deploy needs your Vercel login once:
```bash
npx vercel login      # opens a browser; the one step only you can do
npm run deploy        # links the project, copies .env.local into Vercel (production), deploys, then fixes APP_BASE_URL
```
`npm run deploy` refuses to run until the required keys are filled in and never prints a secret. Afterwards set `APP_BASE_URL` in `.env.local` to the live address and point the 5-minute cron job (step 6) at it. The Courtyard's *Setup status* card shows anything still missing.

### Demo mode (current): open dashboard, no logins
`DEMO_OPEN=true` (set in `.env.local` and copied to Vercel by `npm run deploy`) makes the whole dashboard open: **no login, no passcode**, so a reviewer can just visit the URL. Nothing else about the product changes.
- **Team** (left rail) shows every employee and exactly which leads are assigned to them, with status, call-back time, how fast they accepted, and anything overdue. Click **View {name}'s dashboard** to open that employee's own page, or use the **Viewing as** switcher at the top of it to hop between employees, and **Studio view** to come back.
- **Sample data:** the database holds the 20 real transcripts (T01–T20) as sample enquiries (`DEMO-01`…`DEMO-20`), run through the real rules engine and spread across the employees, including a reassignment (DEMO-15), an escalation (DEMO-09), overdue callbacks, and a full audit trail. They are stored as simulated rows, so **they never mix with real numbers**: turn demo mode off and they drop out of every figure. Costs on the sample rows use invented rates.
- **What an open dashboard means:** anyone with the URL can see (sample) data and press buttons. Keep the link private, and **set `DEMO_OPEN=false` before any real caller data arrives**.
- The webhook, cron and Vaani endpoints stay protected by their own secrets even in demo mode.

### Going live: who can see what
With `DEMO_OPEN=false` sign-in is enforced:
- **Designers** sign in at `/login` with their own email: they get a one-time link (works once, 20 minutes), then a 30-day session. They see **only their own leads** (full brief, transcript, recording, phone number), their own numbers, and the trail of their own actions. They cannot open the admin screens.
- **Nikhil, the front desk and the senior person** see everything. They sign in with the studio passcode (`DASHBOARD_PASSCODE`) or an emailed link sent to `NIKHIL_EMAIL`, `FRONTDESK_EMAIL` or `ESCALATION_EMAIL`.
- **Accountability:** every Accept, Pass, Called back, Booking and reassignment, plus every system step (lead emailed, reminder sent, moved on, escalated), is written to `actions_log` with the actor's name, time and source. It shows on the lead (Activity) and in the designer's own recent-activity list. An admin acting for someone is recorded as the admin, never as the designer.

### 4. Email (Resend)
Everything the system sends is email: handoffs, reminders, escalations, digests, reports and calendar invites.
- Create a Resend API key. Keep `EMAIL_FROM="Aangan Studio <onboarding@resend.dev>"` until you verify a domain (needed before it can deliver to anyone other than your own address).
- Fill `NIKHIL_EMAIL`, `FRONTDESK_EMAIL` (a shared inbox the front desk watches) and `ESCALATION_EMAIL` (the senior person for existing-client calls; falls back to Nikhil). Add every designer's address on **Studio Roster**.
- While `EMAIL_TEST_MODE=true` **every email goes to `TEST_EMAIL`** with the intended recipient shown in an amber bar at the top. Rehearsals always go to `TEST_EMAIL`, even when test mode is off. Flip test mode off only when you are ready for designers to receive real leads.
- Designers sign in with the same email address you put on the roster. Tell them to mark the sender as **VIP / priority** in their phone's mail app, so handoffs trigger a push notification (see the note below).

### 5. Vaani: agent, number, webhook
1. In Vaani, **Agents → Create Agent**. Paste the prompt from Agent Config in the dashboard (only after Nikhil approves House Rules). The prompt has no `{` or `}` because Vaani treats those as variables; the page warns if one appears. Pick the language and voice, and set the greeting.
2. **Settings → Telephony**: provision a number. Forward the studio line to it: 10:00 to 19:00 rings the front desk for about 20 seconds, then Vaani. After hours and Sundays go straight to Vaani.
3. **Developers → Webhooks → New End Point**: add `https://<your-live-url>/api/voice/webhook?secret=<VAANI_WEBHOOK_SECRET>`. Vaani does not sign webhooks, so the secret travels in the URL. Every call is re-checked with `GET /api/call_details/{call_id}` before anything is acted on.
4. Set `VAANI_API_KEY` and `VAANI_API_BASE=https://api.vaanivoice.ai/api`. Vaani's call-history endpoint currently fails for this account, so the app relies on webhooks only.

### 6. Scheduler (nothing to set up)
Reminders, hand-overs to the next designer, HubSpot retries and the daily emails run by themselves: every open dashboard and every finished call nudges `/api/tick`, which runs at most once a minute. Vercel also calls it twice a day as a safety net (`vercel.json`). No outside cron service is needed. (If you ever want a stricter clock, point any cron service at `/api/cron/tick` with `Authorization: Bearer <CRON_SECRET>`.)

### 7. Approve House Rules (Gate 1)
Open **House Rules** → read the script, never-say list, service area and the *rules to confirm* → tick the box → **Approve & publish**. Until then the dashboard shows an amber "Gate 1 is open" bar.

### 8. Rehearse, then one real call
Rehearsal Room → replay **T01**, **T09**, **T13** (the handoff email arrives at `TEST_EMAIL` within seconds). Then make one real after-hours call to the Vaani number. It should be answered within 3 rings, appear on **Front Door** with its cost, and the handoff email should land within 5 minutes of hanging up.

### HubSpot (optional)
Set `HUBSPOT_ACCESS_TOKEN` (a HubSpot service key) and run `npm run hubspot:setup` once. It creates the `aangan_*` properties and finds the deal pipeline. After that every real enquiry is sent to HubSpot: a Contact (matched by phone), a Deal in the default pipeline whose stage follows the enquiry, and a note for each event. A designer becomes the owner only when their email matches a HubSpot user. Failures are retried by the scheduler. Sample and rehearsal enquiries are never sent automatically; the Brief Book has a "Send to HubSpot now" button. The sync is one-way (app to HubSpot) and includes callers' phone numbers and call notes, so the caller consent line applies. `npm run hubspot:test` and `npm run hubspot:e2e` check it against the real account and clean up after themselves.

## Why email is the only channel (and what that costs)
Email is universal, needs no bot or group setup, and carries the full brief. **Every email goes out automatically** (no one approves or sends anything by hand). Each one links into the designer's own dashboard, where the recording, transcript and every button live behind their sign-in; there are no anonymous action links. After **Accept**, *Called back* and *Book consultation* are on the same page, and booking emails a calendar invite.

The trade-off, honestly: designers are often on site, and email is slower and easier to miss than a chat app. The first hour is where the 4× conversion is, so:
- have designers mark the sender **VIP** (or set a mail filter with a loud tone) on their phone;
- the ladder is built for this: a "Still waiting" reminder at 10 minutes, reassignment at 15, and the front desk is emailed after two reassignments;
- the delivery log and **Reaching the team** panel on the Courtyard show how fast Accepts really happen, so you will see within a week whether email is fast enough;
- a `NotifyChannel` seam (`lib/notify/index.ts`) is kept so SMS or WhatsApp can be added later without touching the pipeline. See *Adding a channel* below.

## The escalation ladder (nothing waits silently)
| When | What |
|---|---|
| T+0 | handoff email to the designer on duty (after hours it waits in the inbox; the ladder clock starts at 09:30) |
| T+10 min | no tap → a "Still waiting" reminder email with the same Accept / Pass buttons |
| T+15 min | no Accept → reassigned to the next designer; the first is emailed "no action needed" |
| after 2 reassignments | email to the front-desk inbox with a link to assign anyone |
| callback due −15 min | reminder to the accepted designer |
| overdue / +15 min / +60 min | nudge → front desk told → "missed promise" in Nikhil's summary |
| existing client | email to Nikhil + the senior person at once, repeated every 10 min until someone taps "I've got it"; 15-minute clock |

Overnight the ladder **pauses** and restarts at 09:30 (minutes are counted only inside 09:30–19:00, Mon–Sat). After-hours qualified leads are emailed at once (they are waiting in the inbox in the morning), and the caller is promised a callback by 11am next working morning (read from the approved rules, not hard-coded). Several reminders due together go out as one email; at most one nudge per lead per 10 minutes.

## Vaani notes
"Vaani" names several products. I read the public docs for the **VaaniYantra** platform (`call.completed` / `call.failed` webhooks, `X-VaaniYantra-Signature` = HMAC-SHA256 of the raw body, `x-api-key` auth, `GET /api/v1/numbers`). The adapter (`lib/voice/vaani.ts`) is tolerant of field-name variants (camelCase/snake_case, `data` envelope, transcript as array or string) and also accepts a shared secret in `x-webhook-secret` / `?secret=`. **Confirm against your own account's docs** and use Vaani's "Send test" button; the raw body of every webhook is kept in `webhook_inbox`.

| Question | Where |
|---|---|
| (1) System prompt / knowledge | paste `voice/agent-config.md` into the agent's prompt; greeting = the opening line |
| (2) Languages | set Indian English with Hindi/Marathi (or auto-detect); the prompt tells the agent to mirror the caller, including Hinglish |
| (3) Number + forwarding | attach/buy the number in Vaani; on the studio line set "ring front desk first, ~20 s, then forward" (about 3 rings) in 10am–7pm; after hours and Sundays forward straight to Vaani. If your telephony cannot time-based route, the simplest option is **always forward to the agent** and let the agent hand over to the desk: note this in the rollout |
| (4) Mid-call tools | optional: `escalate_existing_client` → `POST /api/voice/tools/escalate` (header `x-webhook-secret`). Without tools, the pipeline escalates right after the call |
| (5) Post-call webhook | `POST /api/voice/webhook`; payload mapped in the adapter; if the payload has no transcript the app fetches it from `VAANI_API_BASE/calls/:id` |
| (6) Signing | HMAC-SHA256 hex, optional `sha256=` prefix, verified with `VAANI_WEBHOOK_SECRET` |
| No webhook? | set `VAANI_POLL=true` and `VAANI_API_BASE`: the 5-minute tick polls the call list |

## Costs
Every call logs Vaani minutes (per started minute × `COST_VAANI_PER_MIN_INR`) and every Gemini call logs tokens (from `usageMetadata`) to `cost_ledger`; `COST_FIXED_MONTHLY_INR` is booked once a month. The Courtyard shows cost per call / qualified lead / consultation next to "pipeline generated" (consultations × the editable average project value, labelled indicative and internal only).

## Tests
```bash
npm test                      # core + verdicts + compliance (offline, no keys needed)
npm run test:verdicts:live    # same expectations, Gemini reads each transcript (needs GEMINI_API_KEY)
```
- `test:core`: time and callback rules, ladder clock, masking, quote verification, verdict table, locality rules, sign-in tokens and sessions (forgery and role checks), Vaani adapter, templates.
- `test:compliance`: a fake call with "around ₹2,000 per sq ft" raises flags; every approved script line stays clean; the built prompt contains the exact price line and no price figures.
- `test:verdicts`: T01–T20. The offline run feeds hand-written "golden" extractions through the real rules engine (`decide()`), and every golden quote is checked against the transcript. **The live run is the real test of Gemini.**

### Where my reading of qualified.md differs from the expected outcomes
Four calls come out **UNSURE** instead of qualified. The expectations were *not* changed; the test prints each disagreement.
- **T11, T13, T14**: the timeline was never discussed on the call, and qualified.md says unclear on criteria 1–3 means "ask one direct question". The human front desk booked without asking. The voice agent is scripted to ask, so this should not happen live.
- **T16**: the caller never said what work they want or when. It is UNSURE but **PRIORITY**, and an unsure + priority lead alerts the front desk immediately instead of waiting for the 10am digest.

If you would rather forward a lead whose only gap is the timeline, it is a one-line change in `computeVerdict` (`lib/pipeline/decide.ts`).

Other judgement calls (also listed on the House Rules screen as *rules to confirm*): commercial spaces under 500 sq ft → "check with designer" (Unsure) (T18); Pune localities not on the list (Kharadi, Nanded City…) are accepted as "adjoining areas" and flagged; the 6-week minimum applies only when the caller gives a **finish** date (T15's possession date alone doesn't fail it); T07's "before Diwali" fails the timeline.

## Adding a channel (SMS / WhatsApp for alerts)
Implement `NotifyChannel` in `lib/notify/index.ts` and call it from `send()` for urgent kinds (`handoff`, `nudge`, `escalation`). Nothing else changes: templates, links, the ladder and the log are channel-neutral.

## Later channels
The pipeline is channel-agnostic: `enquiries.channel`, the `CallRecord → EnquiryInput` types (`lib/types.ts`) and the parsed WhatsApp / web-form fixtures (`scripts/fixtures/other/`, not routed) are already in place. To add one:
- **WhatsApp Business webhook**: verify Meta's signature, group a thread's messages by number into `Turn[]` (caller = the customer), and call the same `processCall`-style path from STEP B (clean → Gemini with the same `qualified.md` → decide → route). Replies come from the same approved lines.
- **Website form**: map the form fields into one synthetic caller turn ("Project type…, Location…, Timeline…, Budget…") and run the same steps.
Only the trigger changes; the handoff email, action links, ladder and dashboard are shared.

## Privacy and safety
- The call opens by saying it is an AI assistant and that the call is recorded. Recordings are served only via a signed, expiring link that proxies the provider's file; the provider URL and API key never reach the browser.
- Card, bank, Aadhaar/PAN-like numbers are masked **before** Gemini sees a transcript.
- Phone numbers are visible only to the assigned designer (on their own dashboard) and to admins.
- Sessions and sign-in links are HMAC-signed. Sign-in links work once, expire in 20 minutes, and need a confirm tap (so email scanners can't burn them). Designers can only reach `/me/*`, enforced in middleware and again on every query. Recording links are signed and last one hour.
- The Vaani webhook verifies its signature; public endpoints are rate-limited; nothing secret reaches the browser.

## Local development
```bash
npm install && npm run dev      # http://localhost:3000, admin passcode = DASHBOARD_PASSCODE
npm run typecheck && npm test
npm run fixtures                # re-parse the PDF into fixtures (needs python3 + pypdf)
npm run agent-config            # regenerate voice/agent-config.{md,json}
```
### 6. Scheduler (the simple cron plan)
There is **one** scheduled endpoint, `/api/cron/tick`. It runs the escalation ladder, retries failed reads, finalises dropped calls, and fires the daily jobs by the IST clock, each exactly once (`job_runs` table): 9:30 "Your day", 10:00 front-desk digest, 20:00 Nikhil summary, Monday 9:00 weekly reports, 1st-of-month report.
- **Every 5 minutes (free):** create a job at cron-job.org with URL `<live address>/api/cron/tick`, schedule *every 5 minutes*, and the request header `Authorization: Bearer <CRON_SECRET>` (the value is in `.env.local`). Any scheduler that can call a URL with a header works the same way (GitHub Actions, Upstash QStash, Vercel Cron on a paid plan).
- **Safety net:** `vercel.json` also calls it twice a day (10:00 and 20:00 IST), so digests still go out if the external job is ever off. Without the 5-minute job the 10-minute reminder and 15-minute reassignment cannot fire.

### 7. Approve House Rules (Gate 1)
Open **House Rules** → read the script, never-say list, service area and the *rules to confirm* → tick the box → **Approve & publish**. Until then the dashboard shows an amber "Gate 1 is open" bar.

### 8. Rehearse, then one real call
Rehearsal Room → replay **T01**, **T09**, **T13** (the handoff email arrives at `TEST_EMAIL` within seconds). Then make one real after-hours call to the Vaani number. It should be answered within 3 rings, appear on **Front Door** with its cost, and the handoff email should land within 5 minutes of hanging up.

## Why email is the only channel (and what that costs)
Email is universal, needs no bot or group setup, and carries the full brief. **Every email goes out automatically** (no one approves or sends anything by hand). Each one links into the designer's own dashboard, where the recording, transcript and every button live behind their sign-in; there are no anonymous action links. After **Accept**, *Called back* and *Book consultation* are on the same page, and booking emails a calendar invite.

The trade-off, honestly: designers are often on site, and email is slower and easier to miss than a chat app. The first hour is where the 4× conversion is, so:
- have designers mark the sender **VIP** (or set a mail filter with a loud tone) on their phone;
- the ladder is built for this: a "Still waiting" reminder at 10 minutes, reassignment at 15, and the front desk is emailed after two reassignments;
- the delivery log and **Reaching the team** panel on the Courtyard show how fast Accepts really happen, so you will see within a week whether email is fast enough;
- a `NotifyChannel` seam (`lib/notify/index.ts`) is kept so SMS or WhatsApp can be added later without touching the pipeline. See *Adding a channel* below.

## The escalation ladder (nothing waits silently)
| When | What |
|---|---|
| T+0 | handoff email to the designer on duty (after hours it waits in the inbox; the ladder clock starts at 09:30) |
| T+10 min | no tap → a "Still waiting" reminder email with the same Accept / Pass buttons |
| T+15 min | no Accept → reassigned to the next designer; the first is emailed "no action needed" |
| after 2 reassignments | email to the front-desk inbox with a link to assign anyone |
| callback due −15 min | reminder to the accepted designer |
| overdue / +15 min / +60 min | nudge → front desk told → "missed promise" in Nikhil's summary |
| existing client | email to Nikhil + the senior person at once, repeated every 10 min until someone taps "I've got it"; 15-minute clock |

Overnight the ladder **pauses** and restarts at 09:30 (minutes are counted only inside 09:30–19:00, Mon–Sat). After-hours qualified leads are emailed at once (they are waiting in the inbox in the morning), and the caller is promised a callback by 11am next working morning (read from the approved rules, not hard-coded). Several reminders due together go out as one email; at most one nudge per lead per 10 minutes.

## Vaani notes
"Vaani" names several products. I read the public docs for the **VaaniYantra** platform (`call.completed` / `call.failed` webhooks, `X-VaaniYantra-Signature` = HMAC-SHA256 of the raw body, `x-api-key` auth, `GET /api/v1/numbers`). The adapter (`lib/voice/vaani.ts`) is tolerant of field-name variants (camelCase/snake_case, `data` envelope, transcript as array or string) and also accepts a shared secret in `x-webhook-secret` / `?secret=`. **Confirm against your own account's docs** and use Vaani's "Send test" button; the raw body of every webhook is kept in `webhook_inbox`.

| Question | Where |
|---|---|
| (1) System prompt / knowledge | paste `voice/agent-config.md` into the agent's prompt; greeting = the opening line |
| (2) Languages | set Indian English with Hindi/Marathi (or auto-detect); the prompt tells the agent to mirror the caller, including Hinglish |
| (3) Number + forwarding | attach/buy the number in Vaani; on the studio line set "ring front desk first, ~20 s, then forward" (about 3 rings) in 10am–7pm; after hours and Sundays forward straight to Vaani. If your telephony cannot time-based route, the simplest option is **always forward to the agent** and let the agent hand over to the desk: note this in the rollout |
| (4) Mid-call tools | optional: `escalate_existing_client` → `POST /api/voice/tools/escalate` (header `x-webhook-secret`). Without tools, the pipeline escalates right after the call |
| (5) Post-call webhook | `POST /api/voice/webhook`; payload mapped in the adapter; if the payload has no transcript the app fetches it from `VAANI_API_BASE/calls/:id` |
| (6) Signing | HMAC-SHA256 hex, optional `sha256=` prefix, verified with `VAANI_WEBHOOK_SECRET` |
| No webhook? | set `VAANI_POLL=true` and `VAANI_API_BASE`: the 5-minute tick polls the call list |

## Costs
Every call logs Vaani minutes (per started minute × `COST_VAANI_PER_MIN_INR`) and every Gemini call logs tokens (from `usageMetadata`) to `cost_ledger`; `COST_FIXED_MONTHLY_INR` is booked once a month. The Courtyard shows cost per call / qualified lead / consultation next to "pipeline generated" (consultations × the editable average project value, labelled indicative and internal only).

## Tests
```bash
npm test                      # core + verdicts + compliance (offline, no keys needed)
npm run test:verdicts:live    # same expectations, Gemini reads each transcript (needs GEMINI_API_KEY)
```
- `test:core`: time and callback rules, ladder clock, masking, quote verification, verdict table, locality rules, sign-in tokens and sessions (forgery and role checks), Vaani adapter, templates.
- `test:compliance`: a fake call with "around ₹2,000 per sq ft" raises flags; every approved script line stays clean; the built prompt contains the exact price line and no price figures.
- `test:verdicts`: T01–T20. The offline run feeds hand-written "golden" extractions through the real rules engine (`decide()`), and every golden quote is checked against the transcript. **The live run is the real test of Gemini.**

### Where my reading of qualified.md differs from the expected outcomes
Four calls come out **UNSURE** instead of qualified. The expectations were *not* changed; the test prints each disagreement.
- **T11, T13, T14**: the timeline was never discussed on the call, and qualified.md says unclear on criteria 1–3 means "ask one direct question". The human front desk booked without asking. The voice agent is scripted to ask, so this should not happen live.
- **T16**: the caller never said what work they want or when. It is UNSURE but **PRIORITY**, and an unsure + priority lead alerts the front desk immediately instead of waiting for the 10am digest.

If you would rather forward a lead whose only gap is the timeline, it is a one-line change in `computeVerdict` (`lib/pipeline/decide.ts`).

Other judgement calls (also listed on the House Rules screen as *rules to confirm*): commercial spaces under 500 sq ft → "check with designer" (Unsure) (T18); Pune localities not on the list (Kharadi, Nanded City…) are accepted as "adjoining areas" and flagged; the 6-week minimum applies only when the caller gives a **finish** date (T15's possession date alone doesn't fail it); T07's "before Diwali" fails the timeline.

## Adding a channel (SMS / WhatsApp for alerts)
Implement `NotifyChannel` in `lib/notify/index.ts` and call it from `send()` for urgent kinds (`handoff`, `nudge`, `escalation`). Nothing else changes: templates, links, the ladder and the log are channel-neutral.

## Later channels
The pipeline is channel-agnostic: `enquiries.channel`, the `CallRecord → EnquiryInput` types (`lib/types.ts`) and the parsed WhatsApp / web-form fixtures (`scripts/fixtures/other/`, not routed) are already in place. To add one:
- **WhatsApp Business webhook**: verify Meta's signature, group a thread's messages by number into `Turn[]` (caller = the customer), and call the same `processCall`-style path from STEP B (clean → Gemini with the same `qualified.md` → decide → route). Replies come from the same approved lines.
- **Website form**: map the form fields into one synthetic caller turn ("Project type…, Location…, Timeline…, Budget…") and run the same steps.
Only the trigger changes; the handoff email, action links, ladder and dashboard are shared.

## Privacy and safety
- The call opens by saying it is an AI assistant and that the call is recorded. Recordings are served only via a signed, expiring link that proxies the provider's file; the provider URL and API key never reach the browser.
- Card, bank, Aadhaar/PAN-like numbers are masked **before** Gemini sees a transcript.
- Phone numbers are visible only to the assigned designer (on their own dashboard) and to admins.
- Sessions and sign-in links are HMAC-signed. Sign-in links work once, expire in 20 minutes, and need a confirm tap (so email scanners can't burn them). Designers can only reach `/me/*`, enforced in middleware and again on every query. Recording links are signed and last one hour.
- The Vaani webhook verifies its signature; public endpoints are rate-limited; nothing secret reaches the browser.

## Local development
```bash
npm install && npm run dev      # http://localhost:3000, admin passcode = DASHBOARD_PASSCODE
npm run typecheck && npm test
npm run fixtures                # re-parse the PDF into fixtures (needs python3 + pypdf)
npm run agent-config            # regenerate voice/agent-config.{md,json}
```
