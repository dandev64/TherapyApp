# Email Notification Functions (Commented Out)

## Context
Create Supabase Edge Functions for email notifications, but keep them **fully commented out** so they don't consume free tier resources. The code will be ready to uncomment and deploy when needed.

## What gets emailed (2 scenarios)
1. **Therapist reminder** — morning check: if a therapist hasn't assigned any tasks for a patient today, email the therapist
2. **Patient reminder** — if a patient hasn't completed a task past its scheduled time of day, email the patient

## Existing infrastructure to leverage
- `notifications` table already exists with types: `task_completed`, `task_overdue`, `task_comment`, `new_message`
- `profiles` table has `email` field for all users
- `check_overdue_tasks()` SQL function already finds overdue tasks
- Notification triggers already fire on task completion/feedback

## Implementation Plan

### 1. Create Supabase Edge Function files (commented out)

**`supabase/functions/send-email-reminders/index.ts`**
- Commented-out Deno Edge Function using Resend API
- Two main checks:
  - Query therapists who have patients with no tasks today → send reminder email
  - Query patients with incomplete tasks past their time slot → send reminder email
- Uses `RESEND_API_KEY` env var
- Designed to be called via pg_cron or external cron

### 2. Add SQL migration for email scheduling

**`supabase/migration_email_notifications.sql`**
- Commented-out SQL that:
  - Adds `email_notifications_enabled` boolean to `profiles` table (opt-in)
  - Creates `email_log` table to prevent duplicate sends
  - Creates pg_cron schedule to call the Edge Function twice daily (8am for therapist reminders, hourly for patient reminders)
  - Creates `send_email_reminders()` SQL function that calls the Edge Function via `pg_net`

### 3. Add env variable placeholder

**Update `.env.example`**
- Add `RESEND_API_KEY=your_resend_api_key_here` (commented)

## Files to create/modify
| File | Action |
|------|--------|
| `supabase/functions/send-email-reminders/index.ts` | Create (all code commented) |
| `supabase/migration_email_notifications.sql` | Create (all SQL commented) |
| `.env.example` | Add commented RESEND_API_KEY |

## How to activate later
1. Sign up at resend.com, get API key
2. Set `RESEND_API_KEY` in Supabase Edge Function secrets
3. Uncomment the Edge Function code and deploy: `supabase functions deploy send-email-reminders`
4. Uncomment and run the SQL migration in Supabase dashboard
5. Enable pg_cron extension in Supabase dashboard

## Verification
- All files are syntactically correct (just commented)
- No runtime impact — nothing executes until uncommented
- Clear instructions in comments for activation
