---
name: habitot-edits
description: Status and remaining work for the client-requested HabitOT website edits (from HabitOT-website-development-edits.pdf), with item IDs, file pointers, and how to test. Use when working on any of these edits, when the user references an item ID like Q15 or F2, asks "what's left", or wants the app tested.
---

# HabitOT client edits

Source: `c:\Users\danme\Downloads\HabitOT-website-development-edits.pdf` (12 pages). Do NOT re-read the PDF; this file is the working copy.

Stack: Vite + React 19 + Tailwind 4 + Supabase (`src/lib/supabase.js`). Base schema `supabase/schema.sql` + `supabase/migration.sql`; this round's DB changes are in `supabase/migration-2026-10-client-edits.sql` (already run on the live DB, 2026-10-04). Times are local UTC+8 (Asia/Manila).

## Status (as of 2026-10-04)
40 of 43 items done, verified end-to-end in headless Edge against the live DB (44/44 checks passed). Pushed to `origin/master` (the only branch; there is no `main`).

To push from here: the default saved credential is a different account (`danmedado04-git`, 403). In PowerShell set `$env:GIT_TERMINAL_PROMPT='1'; $env:GCM_INTERACTIVE='always'`, remove `GIT_ASKPASS` and `VSCODE_GIT_ASKPASS_MAIN`, then run `git -c credential.helper= -c credential.helper=manager push https://dandev64@github.com/dandev64/TherapyApp.git master` followed by `git fetch origin`.

## Open items
- [x] **Q15 Logo** — done 2026-10-04. Full logo `public/habitot-logo.png` (login/signup); house-only mark `public/habitot-icon.png` (sidebar); `public/favicon.png` + `public/apple-touch-icon.png` (index.html). Source: `c:/Users/danme/Downloads/HabitOT logo.png` (1500px, white background).
- [ ] **Q16 Confirmation email says "HabitOT"** — not code. The user pastes into Supabase → Authentication → Email Templates → Confirm signup. Subject `Confirm your HabitOT account`; body `<h2>Welcome to HabitOT!</h2><p>Thanks for signing up. Confirm your email to start using HabitOT:</p><p><a href="{{ .ConfirmationURL }}">Confirm my HabitOT account</a></p>`. Ask if done.
- [ ] **F2 Schedule a task** — SKIPPED until the client clarifies. Tasks already have a date and time; possible meaning is "hidden from the patient until a publish time". Would need a `publish_at` column, a filter in the patient queries, and a field in `TaskAssignmentPage.jsx` and the assign modal in `PatientDetailPage.jsx`.
- [ ] **B9 Mobile consistency % display error** — SKIPPED pending a screenshot. The Progress page now fits 375px with no overflow; it may already be fixed. Other places showing consistency: `TherapistDashboard.jsx` stat cards and table, `PatientCard.jsx`, `PatientDetailPage.jsx`.

### Decisions to raise (not in the PDF)
- Old patient-written `daily_remarks` are hidden everywhere now. Show them to therapists read-only, or leave them?
- Email reminders (`supabase/functions/send-email-reminders`) only send if Resend + cron are set up and the patient opted in. The new reminders are in-app only.
- Test leftovers: `[test]`/`[ui-test]` messages in the therapist1 ↔ patient1 chat (messages can't be deleted via RLS).
- `src/pages/therapist/PatientsPage.jsx` is dead code (not routed) and can be deleted.
- PDF headings "Client Notes" and therapist "Profile" are empty, so no changes were made there.

## Done (for reference)
B1–B8, Q1–Q14, L1–L10, F1, F3–F8. Key places:
- Notifications: `src/contexts/NotificationContext.jsx` (two badges: Notifications = unseen non-message, Messages = unread messages; realtime + 15s poll fallback; `markAllSeen` sets `seen_at`), `src/pages/therapist/NotificationsPage.jsx` (shared by both roles), click routing in `src/utils/notificationNav.js`, pop-ups in `src/components/ui/Toast.jsx`.
- Notifications-tab crash root cause: `src/hooks/useCachedState.js` cached functional updaters. Now resolved.
- Chat: `src/components/ChatThread.jsx` used by both chat pages (realtime + 5s poll, caret hidden in bubbles).
- Tasks: `src/pages/patient/TaskDetailPage.jsx` (two-step flow, up to 3 photos with no `capture` attr, edit submission, future tasks locked), photos via `src/components/ProofPhotos.jsx` + `src/utils/proofs.js` (`proof_urls[]`, `proof_url` = first).
- Remarks: table `therapist_remarks`, written in `src/components/therapist/ReadOnlyCalendar.jsx`, shown on `src/pages/patient/PatientDashboard.jsx` (Today).
- Calendar tab: `src/pages/therapist/TherapistCalendarPage.jsx` (ReadOnlyCalendar without patientId).
- Consistency: `calculateConsistency` in `src/utils/streak.js` (last 30 days through today; therapist views filter by therapist_id; also returns `missed`).
- DB triggers: message → notification for any sender; `notify_patient_new_task` sets `reference_id`; `notify_new_remark`; cron `patient-inapp-reminders` every 5 min runs `generate_patient_task_reminders()` (due-in-1h + overdue today).

## How to work / test
- Read only the files listed for an item, then `npm run build` and `npx eslint src`.
- New DB changes go in a new `supabase/migration-*.sql`; tell the user to run it (no CLI or service key here).
- Local run: `.env.local` (gitignored) points at the live project `afzprgdowymgvmxtrqzc`. `npx vite --port 5199`.
- Test accounts: `therapst1@gmail.com` (note the spelling) and `patient1@gmail.com`; ask the user for the password. They are linked (therapist ↔ patient).
- No browser MCP tool in this setup. UI testing works with `playwright-core` installed in the session scratchpad (not the project), using `chromium.launch({ channel: 'msedge' })`. Edge is installed. Prefix test data with `[test]` and delete it afterwards. Client clock runs slightly ahead of the server, so don't filter by `created_at >= localNow`.
- Commit message style: `<Month> <day> <summary>`.
