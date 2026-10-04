---
name: habitot-edits
description: Record of the client-requested HabitOT website edits (from HabitOT-website-development-edits.pdf) — all done — with where each lives in the code, open decisions, and how to run/test the app against the live Supabase project. Use when changing any of these features, when the user references an item ID like F2 or L4, asks "what's left", or wants the app tested.
---

# HabitOT client edits

Source: `c:\Users\danme\Downloads\HabitOT-website-development-edits.pdf` (12 pages). Do NOT re-read the PDF; this file is the working copy.

Stack: Vite + React 19 + Tailwind 4 + Supabase (`src/lib/supabase.js`). Base schema `supabase/schema.sql` + `supabase/migration.sql`. This round's DB changes: `supabase/migration-2026-10-client-edits.sql` and `supabase/migration-2026-10-scheduled-tasks.sql` (both run on the live DB, 2026-10-04). Times are local UTC+8 (Asia/Manila).

## Status (as of 2026-10-04)
**All 43 items done.** Everything is pushed to `origin/master` (the only branch; there is no `main`). Vercel deploys from it.

Verification done against the live DB:
- UI end-to-end in headless Edge: 44/44 checks passed.
- Scheduled posting: 7/7 checks passed.
- Mobile audit at 390x844: no overflow, no zoom-triggering inputs.

The confirmation email template (Q16) was updated by the user in Supabase.

To push from here: the default saved credential is a different account (`danmedado04-git`, 403). In PowerShell set `$env:GIT_TERMINAL_PROMPT='1'; $env:GCM_INTERACTIVE='always'`, remove `GIT_ASKPASS` and `VSCODE_GIT_ASKPASS_MAIN`, then run `git -c credential.helper= -c credential.helper=manager push https://dandev64@github.com/dandev64/TherapyApp.git master` followed by `git fetch origin`.

## Decisions to raise (not in the PDF)
- Old patient-written `daily_remarks` are hidden everywhere now. Show them to therapists read-only, or leave them?
- Email reminders (`supabase/functions/send-email-reminders`) only send if Resend + cron are set up and the patient opted in; the new reminders are in-app only. The function was edited to skip unposted tasks; it needs `supabase functions deploy send-email-reminders` if emails are used.
- Test leftovers: `[test]`/`[ui-test]` messages in the therapist1 ↔ patient1 chat (messages can't be deleted via RLS).
- `src/pages/therapist/PatientsPage.jsx` is dead code (not routed) and can be deleted.
- The logo has a white background, so it shows as a white rounded square in dark mode. A transparent PNG would fix that.
- PDF headings "Client Notes" and therapist "Profile" are empty, so no changes were made there.

## What was done, and where
Item IDs: B = bugs, Q = quick wins, L = logic, F = features.

- **Notifications (B1, B2, B4, B5, L8, L9)**
  - `src/contexts/NotificationContext.jsx`: two badges (Notifications = unseen non-message; Messages = unread messages), realtime plus a 15s poll fallback, and `markAllSeen` sets `seen_at`.
  - `src/pages/therapist/NotificationsPage.jsx` is shared by both roles.
  - Click routing is in `src/utils/notificationNav.js`; pop-ups are in `src/components/ui/Toast.jsx`.
  - Crash root cause: `src/hooks/useCachedState.js` cached functional updaters.
- **Chat (B3, B6)**: `src/components/ChatThread.jsx` is used by both chat pages (realtime plus a 5s poll; caret hidden in bubbles).
- **Auth (B7, Q12, Q13)**: `SignUpPage.jsx` (confirm password, check-email screen on rate limit); `src/components/ui/PasswordInput.jsx`.
- **Layout and mobile (B8, B9)**
  - `src/components/layout/Sidebar.jsx`: sticky desktop sidebar; on phones, an app bar (menu, logo, bell) and a patient bottom tab bar (hidden in chat threads).
  - `DashboardLayout.jsx`: padding for the app bar and tab bar.
  - `Modal.jsx`: bottom sheet on phones.
  - `index.css`: 16px inputs under 640px.
  - `index.html`: viewport-fit=cover, pinch zoom allowed.
- **Logo (Q15)**: full logo `public/habitot-logo.png` (login/signup, `w-52`); house mark `public/habitot-icon.png` (sidebar `w-14`, app bar); `public/favicon.png`; `public/apple-touch-icon.png`.
- **Copy and small UI (Q1–Q11, Q14)**: sidebar labels, dates on the dashboards (`formatLongDate` in `src/utils/time.js`), schedule month button, task wording, profile cleanup, delete confirmation in `TaskAssignmentPage.jsx`.
- **Consistency (L1, L2, L10)**: `calculateConsistency` in `src/utils/streak.js` (last 30 days through today; therapist views filter by therapist_id; also returns `missed`).
- **Remarks (L3, L4)**: table `therapist_remarks`, written in `src/components/therapist/ReadOnlyCalendar.jsx`, shown on `src/pages/patient/PatientDashboard.jsx` (Today). Mood summary removed from `ProgressPage.jsx`.
- **Feedback list (L5)**: `PatientFeedbackList.jsx` shows mood-only entries.
- **Patient task page (L6, L7, F4, F5, F6)**: `src/pages/patient/TaskDetailPage.jsx`
  - Two-step flow; future tasks are locked.
  - Up to 3 photos, with no `capture` attribute so phones offer the photo library.
  - Edit submission after completion.
  - Photos are stored in `proof_urls[]` (`proof_url` = first) and shown via `src/components/ProofPhotos.jsx` + `src/utils/proofs.js`.
- **Therapist tasks (F1, F3)**: edit tasks in `TaskAssignmentPage.jsx`; the Calendar tab `src/pages/therapist/TherapistCalendarPage.jsx` reuses ReadOnlyCalendar without a patientId.
- **Scheduled posting (F2)**: works like a scheduled email.
  - `task_assignments.publish_at` (NULL = post now). RLS hides unposted tasks from patients.
  - Helpers `postedOnly()`/`isScheduled()` are in `src/utils/tasks.js`.
  - The UI is `src/components/therapist/PublishTimeField.jsx`, used in TaskAssignmentPage and the PatientDetailPage assign modal.
  - Cron `publish-scheduled-tasks` (every minute) sends the "new task" notification at post time.
- **Reminders (F7, F8)**: cron `patient-inapp-reminders` (every 5 min) runs `generate_patient_task_reminders()` (due within 1 hour, and overdue today; skips unposted tasks).
- **DB triggers**: message → notification for any sender; `notify_patient_new_task` (sets `reference_id`, skips scheduled tasks); `notify_new_remark`.

## How to work / test
- Read only the files relevant to the change, then run `npm run build` and `npx eslint src`.
- New DB changes go in a new `supabase/migration-*.sql`; tell the user to run it (there's no CLI or service key here). Afterwards, check it was applied by selecting a new column via supabase-js.
- Keep frontend changes working before a migration runs, e.g. `select('*')` and only send new columns when they're used.
- Local run: `.env.local` (gitignored) points at the live project `afzprgdowymgvmxtrqzc`. Start with `npx vite --port 5199`.
- Test accounts: `therapst1@gmail.com` (note the spelling) and `patient1@gmail.com`; ask the user for the password. They are linked (therapist ↔ patient).
- There's no browser MCP tool in this setup. For UI testing, install `playwright-core` in the session scratchpad (not the project) and use `chromium.launch({ channel: 'msedge' })`; Edge is installed.
- For mobile checks, use a 390x844 viewport and check `scrollWidth`, tap sizes ≥ 40px, and input font size ≥ 16px.
- Prefix test data with `[test]` and delete it afterwards. The client clock runs slightly ahead of the server, so don't filter by `created_at >= localNow`.
- Commit message style: `<Month> <day> <summary>`.
