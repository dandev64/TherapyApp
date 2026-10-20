# HabitOT database: current live state

This file is compiled from `supabase/schema.sql`, `supabase/migration.sql` and every `supabase/migration-2026-10-*.sql`. It was checked against the live project `afzprgdowymgvmxtrqzc` on 2026-10-21 using `pg_policies`, `pg_proc`, `pg_trigger`, `cron.job` and `pg_indexes`.

It describes **what is live now**. Where a later migration redefined something, only the latest version is shown. Read the SQL files only when you need a full function body. Live is the source of truth, so check `supabase db query --linked` if anything here looks off.

**When the DB changes,** update this file in the same commit as the new migration.

## Conventions
- **Time zone:** dates are Asia/Manila (UTC+8). SQL uses `(now() AT TIME ZONE 'Asia/Manila')::date`. The stats RPCs take "today" from the browser.
- **Function settings:** every function has `SET search_path = ''` and schema-qualifies its tables (`public.x`).
- **Grants:** app RPCs are granted to `authenticated` only, never `anon`. Cron-only functions are granted to `service_role` only.
- **Error handling:** trigger functions catch `WHEN OTHERS`, `RAISE LOG`, and still `RETURN NEW`. A failed notification never blocks the write.
- **Roles:** `profiles.role` is one of therapist / patient / caregiver. `current_user_role()` is SECURITY DEFINER and is used inside policies to avoid RLS recursion.

## Tables
Every table has RLS enabled. `id uuid pk default gen_random_uuid()` and `created_at timestamptz default now()` are omitted below. All FKs to profiles are `ON DELETE CASCADE`.

| Table | Columns | Notes |
|---|---|---|
| **profiles** | `id` (FK auth.users), role!, full_name!, email!, condition, email_notifications_enabled (default **true**) | Created by `handle_new_user` on signup. Role comes from signup metadata, default 'patient'. |
| **patient_assignments** | patient_id!, assigned_to!, relationship! ('therapist'\|'caregiver'), archived_at | The link table that drives almost every policy. UNIQUE(patient_id, assigned_to). `archived_at` is set via `set_patient_archived`. |
| **task_assignments** | template_id (FK templates, SET NULL), patient_id!, therapist_id!, assigned_date! (default CURRENT_DATE), assigned_time_of_day, assigned_time (time), status! ('pending'\|'in_progress'\|'completed'), completed_at, is_rest_day (default false), title, description, details, duration_minutes, therapy_type, requires_proof, resource_url, proof_url, proof_urls text[], publish_at, proof_video jsonb | Tasks are self-contained; templates are legacy. A rest day is a row with `is_rest_day = true`, limited to one per patient per date by a unique partial index. `publish_at` NULL means posted immediately. `proof_video` = `{key,size,uploaded_at,duration}`, written only by the proof-video Edge Function. |
| **task_feedback** | task_assignment_id! (FK cascade), patient_id!, mood! (excited/happy/calm/scared/anxious/angry/tired/sad), note, therapist_read_at | The task comment. Shows under Client Notes, and counts as unread until `mark_task_feedback_read` runs. |
| **caregiver_notes** | caregiver_id!, patient_id!, content!, therapist_read_at | Marked read via `mark_client_note_read`. |
| **note_replies** | note_id! (FK caregiver_notes), author_id!, content! | |
| **daily_remarks** | patient_id!, date!, content! | UNIQUE(patient_id, date). The patient's own daily remark. |
| **therapist_remarks** | therapist_id!, patient_id!, date!, content!, updated_at | UNIQUE(therapist_id, patient_id, date). |
| **messages** | sender_id!, recipient_id!, content!, read_at | No UPDATE policy; read state is set only via `mark_messages_read`. |
| **notifications** | recipient_id!, type!, patient_id, reference_id, content!, read_at, seen_at | `type` is one of task_completed, task_overdue, task_comment, new_message, new_task, task_due_soon, new_remark. `seen_at` = the badge was cleared. `read_at` = dismissed. Rows can't be deleted. |
| **email_log** | recipient_id!, email_type!, reference_date! (default CURRENT_DATE), sent_at, provider_id | Unique index `email_log_unique_send(recipient_id, email_type, reference_date)` claims a send before it goes out; `provider_id = 'pending'` while in flight. A cron purges rows older than 30 days. |
| **task_templates** | therapist_id!, title!, description, duration_minutes!, therapy_type! (speech/occupational/physical), repeat_days text[], start_date, end_date | **Unused by the app.** Live has INSERT, UPDATE and DELETE policies but **no SELECT policy**. |

## RLS policies (live)
"Linked therapist" means there is a `patient_assignments` row with `assigned_to = auth.uid()` and `relationship = 'therapist'` for that patient.

- **profiles**
  - SELECT: self, **any therapist (sees all profiles; part of C1)**, or anyone linked either way through patient_assignments.
  - INSERT: self.
  - UPDATE: self. The trigger blocks changes to email, role and id.
- **patient_assignments**
  - SELECT: `assigned_to = me` or `patient_id = me`.
  - INSERT: `assigned_to = me` and the caller's role is therapist. **This is how a therapist links any patient (C1).**
  - DELETE: same rule as INSERT.
  - No UPDATE policy; archiving goes through the RPC.
- **task_assignments**
  - SELECT: any of the following.
    - `therapist_id = me`.
    - `patient_id = me` and the task is published (`publish_at` is null or ≤ now).
    - A linked therapist.
    - A linked **caregiver**, for published tasks only.
  - INSERT: `therapist_id = me` and the caller's role is therapist.
  - UPDATE: patient or therapist of the row. Patients are limited further by the `limit_patient_task_updates` trigger.
  - DELETE: `therapist_id = me`.
- **task_feedback**
  - SELECT: own (patient), or a linked therapist.
  - INSERT: `patient_id = me`, and the task is the patient's own.
  - UPDATE: own.
- **caregiver_notes**
  - SELECT: the author caregiver, or a linked therapist.
  - INSERT: `caregiver_id = me`, and I am linked to the patient.
- **note_replies**
  - SELECT: the author, the note's caregiver, or a linked therapist of the note's patient.
  - INSERT: `author_id = me`, with the same access.
- **daily_remarks**
  - SELECT: own, or a linked therapist.
  - INSERT: own.
  - UPDATE: own.
- **therapist_remarks**
  - SELECT: `therapist_id = me` or `patient_id = me`.
  - INSERT: `therapist_id = me`, and I am a linked therapist.
  - UPDATE: own. DELETE: own.
- **messages**
  - SELECT: sender or recipient.
  - INSERT: `sender_id = me`, and a `patient_assignments` link exists between sender and recipient in either direction.
  - No UPDATE or DELETE.
- **notifications**
  - SELECT: `recipient_id = me`.
  - UPDATE: `recipient_id = me`.
  - INSERT: `WITH CHECK (false)`, so only SECURITY DEFINER triggers and functions insert.
  - No DELETE.
- **email_log:** SELECT own only. Writes come from the service role (Edge Function).
- **storage.objects**, bucket `task-proofs` (private). Path `<patient_id>/<task_id>-<ms>.<ext>`.
  - SELECT: the owner folder, or anyone with a `patient_assignments` row for that patient (therapist or caregiver).
  - INSERT, UPDATE and DELETE: owner folder only (`foldername[1] = auth.uid()`).
  - Therapists delete photos through the proof-video function's `delete_task` action.

## Triggers
| Table | Trigger | Function | What it does |
|---|---|---|---|
| auth.users | on_auth_user_created | `handle_new_user` | Inserts a profile, with role from metadata (default patient). |
| profiles | protect_profile_columns (BEFORE UPDATE) | `protect_profile_columns` | `authenticated` and `anon` can't change email, role or id. |
| task_assignments | limit_patient_task_updates (BEFORE UPDATE) | `limit_patient_task_updates` | A patient who isn't also the therapist may change only `status, completed_at, proof_url, proof_urls`. **Add any new patient-editable column to its `allowed` array.** |
| task_assignments | on_task_assigned_notify_patient (AFTER INSERT) | `notify_patient_new_task` | Sends a `new_task` notification. Skips rest days and tasks scheduled for later, which `publish_scheduled_tasks` notifies when they post. |
| task_assignments | on_task_status_updated (AFTER UPDATE) | `notify_all_tasks_completed` | When the last non-rest task of a patient's day completes, notifies the therapist with `task_completed`. Dedupes by joining `reference_id` to the task and comparing `assigned_date`. |
| task_feedback | on_task_feedback_created (AFTER INSERT) | `notify_task_comment` | Sends a `task_comment` notification to the task's therapist, with `reference_id` = the task. |
| messages | on_message_created (AFTER INSERT) | `notify_new_message` | Sends a `new_message` notification to the recipient. `reference_id` = the message, and `patient_id` = the patient in the conversation. |
| therapist_remarks | on_therapist_remark_created (AFTER INSERT) | `notify_new_remark` | Sends a `new_remark` notification to the patient. |

## RPCs called by the app (all granted to `authenticated`)
| Function | Security | Returns | Behaviour |
|---|---|---|---|
| `complete_task(p_task_id, p_proof_urls text[], p_mood, p_note)` | INVOKER | text | Completes the task and inserts feedback in one transaction. Returns `'already_completed'` and changes nothing if the task is already completed. Raises 42501 if the task isn't found or isn't the caller's. Defined in complete-task-result.sql. |
| `mark_messages_read(p_ids uuid[])` | DEFINER | void | Sets `read_at` on messages where the caller is the recipient, and marks the matching `new_message` notifications read and seen. |
| `inbox_conversations()` | INVOKER | table(peer_id, id, sender_id, recipient_id, content, created_at, read_at, unread bigint) | One row per conversation partner: the latest message and an unread count. |
| `therapist_patient_summary(p_patient_ids uuid[], p_today date, p_week_from date)` | INVOKER | table(patient_id, total_today, completed_today, rest_today, overall_total, overall_completed, week_missed, streak) | Dashboard and Patients page stats. Filters `therapist_id = auth.uid()`. **Must mirror `src/utils/streak.js`.** |
| `therapist_daily_counts(p_patient_ids uuid[], p_from date, p_to date)` | INVOKER | table(patient_id, assigned_date, total, completed, rest) | Consistency page. `p_from` NULL means from the first task. `src/utils/stats.js#fetchDailyTaskRows` pages through it and expands rows. |
| `mark_task_feedback_read(p_feedback_id)` | DEFINER | void | A linked therapist marks a task comment read. |
| `mark_client_note_read(p_note_id)` | DEFINER | void | A linked therapist marks a caregiver note read. |
| `set_patient_archived(p_patient_id, p_archived bool)` | DEFINER | void | Sets or clears `archived_at` on the caller's therapist link. Raises an error if the patient isn't linked to the caller. |
| `check_overdue_tasks(p_therapist_id)` | DEFINER | void | Must be called with your own id. Takes an advisory lock and inserts `task_overdue` notifications for past, unfinished tasks, once per patient per Manila day. |
| `current_user_role()` | DEFINER, STABLE | text | Used in policies. Granted to PUBLIC. |

**Service-role only:**
- `publish_scheduled_tasks()`: sends `new_task` notifications for tasks whose `publish_at` passed within the last day.
- `generate_patient_task_reminders()`: sends `task_due_soon` (due within 1 hour) and patient `task_overdue` for today's timed tasks.
- `get_email_cron_secret()`: reads Vault `email_cron_secret`.

## Cron (pg_cron)
| Job | Schedule (UTC) | Command |
|---|---|---|
| publish-scheduled-tasks | `*/5 * * * *` | `publish_scheduled_tasks()` |
| patient-inapp-reminders | `*/5 * * * *` | `generate_patient_task_reminders()` |
| patient-daily-email-digest | `0 23 * * *` (07:00 Manila) | `net.http_post` to `send-email-reminders` with body `{"type":"patient"}`. Headers: `Authorization: Bearer <anon key>` and `x-cron-secret` read from `vault.decrypted_secrets` (`email_cron_secret`). |
| cleanup-email-log | `0 0 * * *` | Deletes `email_log` rows older than 30 days. |

The old 15-minute `patient-task-reminder` job was removed in disk-io.sql: pg_net caused 99.8% of write IO. **Don't add frequent `net.http_post` crons.**

## Edge Functions (deploy with `supabase functions deploy <name>`; git push does NOT deploy them)
- **send-email-reminders**
  - `type: patient|all` requires the `x-cron-secret` header.
  - `sync_task_reminder` (also accepted as the old `task_reminder_immediate`) needs the caller's JWT, from the task's therapist or patient. It deletes and cancels the queued Resend email, then claims and re-queues it.
  - Sends are claimed in `email_log` before being sent.
  - Resend sends fail until the `itsbydan.com` domain is verified.
- **proof-video**
  - Uses R2 presigned upload, then `confirm`, which writes `proof_video` conditionally on the newer key and sweeps older keys.
  - `delete_task` (therapist only) deletes the row, the task's storage photos (`<patient>/<task_id>-*`) and its R2 objects.
  - An R2 lifecycle rule deletes videos after 10 days.

## Known open issues
- **C1:** anyone can sign up as a therapist (the role comes from signup metadata). A therapist can then read every profile and link any patient. This waits on the user's decision (invite or admin approval).
- `task_templates` has no SELECT policy. The app doesn't use templates, so this is harmless unless they come back.
- The anon key in `migration-2026-10-disk-io.sql` is the public anon key, not a secret. The cron secret lives only in Vault.

## File map (in the order they were applied)
- `schema.sql`: base tables (profiles, patient_assignments, task_templates, task_assignments, caregiver_notes, note_replies), first policies, and `handle_new_user`.
- `migration.sql`: adds task_feedback, daily_remarks, messages, notifications and email_log. Also profiles.condition, rest days, template repeats, notification triggers, `current_user_role`, `check_overdue_tasks`, the `task-proofs` bucket and its storage policies, and the `cleanup-email-log` cron.
- `migration-2026-10-client-edits.sql`: notifications.seen_at and new types, proof_urls, therapist_remarks, `notify_patient_new_task`, `notify_new_remark`, `generate_patient_task_reminders`, and the 5-min reminder cron.
- `migration-2026-10-scheduled-tasks.sql`: `publish_at`, `publish_scheduled_tasks` and its cron, and a SELECT policy that hides unpublished tasks from patients.
- `migration-2026-10-disk-io.sql`: removes the 15-min email cron, adds the 7 AM digest cron, defaults `email_notifications_enabled` to true, and slows publish to every 5 min.
- `migration-2026-10-revisions-2.sql`: caregiver_notes.therapist_read_at with `mark_client_note_read`, archived_at with `set_patient_archived`, makes notifications undeletable, and stops "new task" alerts for rest days.
- `migration-2026-10-proof-video.sql`: `task_assignments.proof_video`.
- `migration-2026-10-security.sql`:
  - the `protect_profile_columns` and `limit_patient_task_updates` triggers;
  - the linked-only messages INSERT policy;
  - the own-task feedback INSERT policy;
  - grants revoked from anon;
  - the `check_overdue_tasks` caller check;
  - the one-rest-day index;
  - `email_log.provider_id`.
- `migration-2026-10-feedback-read.sql`: task_feedback.therapist_read_at (backfilled) and `mark_task_feedback_read`.
- `migration-2026-10-review-fixes.sql`:
  - `mark_messages_read` (and drops the "Mark messages as read" UPDATE policy);
  - `inbox_conversations`;
  - caregiver task SELECT;
  - `notify_all_tasks_completed` dedupe;
  - the first `complete_task`;
  - Vault cron secret, `get_email_cron_secret`, `email_log_unique_send`, and the cron with its header;
  - indexes on `assigned_date` and `notifications(reference_id, type)`;
  - the Manila date in `check_overdue_tasks`.
- `migration-2026-10-stats.sql`: `therapist_patient_summary` and `therapist_daily_counts`.
- `migration-2026-10-complete-task-once.sql`: `complete_task` becomes a no-op on repeat. Superseded by the next file.
- `migration-2026-10-complete-task-result.sql`: `complete_task` returns 'completed' or 'already_completed'. **This is the current version.**
