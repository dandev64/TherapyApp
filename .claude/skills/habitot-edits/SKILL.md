---
name: habitot-edits
description: Prioritized checklist of client-requested HabitOT website edits (from HabitOT-website-development-edits.pdf), with item IDs and file pointers. Use when working on any of these edits, or when the user references an item ID like B3 or "next edit".
---

# HabitOT client edits

Source: `c:\Users\danme\Downloads\HabitOT-website-development-edits.pdf` (12 pages). Do NOT re-read the PDF unless an item below is unclear; this file is the working copy.

Stack: Vite + React 19 + Tailwind 4 + Supabase (`src/lib/supabase.js`, schema in `supabase/schema.sql`, migrations in `supabase/migration.sql`, edge fn `supabase/functions/send-email-reminders`). Timezone is UTC+8 (see `src/utils/time.js`).

## How to work
- Pick items by ID. Read only the files listed for that item, then grep outward if needed.
- Batch small items that touch the same file into one change.
- After finishing an item, change `[ ]` to `[x]` here. Note any DB migration needed in `supabase/migration.sql` and tell the user to run it.
- Run `npm run build` after each batch to catch errors.
- Items marked **ASK** need a decision from the user before starting.

## P1 — Bugs & stability (broken behavior)
- [x] **B1** Notifications tab throws frequent errors — test and harden. `src/pages/therapist/NotificationsPage.jsx` (also used by patient?), `src/contexts/NotificationContext.jsx`, `src/components/ui/ErrorBoundary.jsx`
- [x] **B2** Red notif badge only drops when items are dismissed — reset count when the Notifications tab is opened (both roles). `NotificationContext.jsx`, `NotificationsPage.jsx`, `src/components/layout/Sidebar.jsx`
- [x] **B3** Chats don't update live — must update without refresh (both roles). `src/pages/patient/MessagesPage.jsx` (realtime channel ~L95), `src/pages/therapist/TherapistMessagesPage.jsx`, both inboxes. Check Supabase realtime publication for `messages`.
- [x] **B4** Message pop-up toasts work for therapist but not patient. `NotificationContext.jsx` (toast + channel), patient pages
- [x] **B5** No notification created when a therapist replies (and verify patient→therapist too, PDF p.9 #5). Find where message notifications are inserted (DB trigger in schema.sql or client code).
- [x] **B6** Therapist message thread: text cursor appears inside message bubbles — bubbles shouldn't be editable/focusable; cursor only in input. `TherapistMessagesPage.jsx`, `MessagesPage.jsx`
- [x] **B7** Clicking create account twice shows "email rate limit exceeded" / "only request after N seconds" — replace with friendly "Check your email to confirm your account". Also disable button while submitting. `src/pages/auth/SignUpPage.jsx`
- [x] **B8** Sidebar scrolls with page — make it fixed/sticky to viewport. `Sidebar.jsx`, `src/components/layout/DashboardLayout.jsx`
- [ ] **B9** (SKIPPED for now per user; Progress cards were made narrower-friendly) Mobile: consistency % display error (layout overflow on Progress / dashboard cards). **ASK** for screenshot if not obvious.

## P2 — Quick wins (copy / small UI)
- [x] **Q1** Patient sidebar "Home" → "Today". `Sidebar.jsx:34`
- [x] **Q2** Patient sidebar "Progress" → "Weekly Progress". `Sidebar.jsx:36` (and page heading in `ProgressPage.jsx`)
- [x] **Q3** Therapist dashboard "Patient Moods" → "All Patient Moods". `src/pages/therapist/TherapistDashboard.jsx`
- [x] **Q4** Show today's date on both home dashboards. `src/pages/patient/PatientDashboard.jsx`, `TherapistDashboard.jsx`
- [x] **Q5** Task button: started-but-unfinished state says "Complete" → rename to "Continue". `PatientDashboard.jsx` / `src/pages/patient/SchedulePage.jsx`
- [x] **Q6** Schedule month nav: middle "Today" button should show month name (e.g. "Sep", "Oct") when viewing another month. `SchedulePage.jsx`
- [x] **Q7** Task page feedback copy: mood → "After completing the task, how did the patient feel about the task?" (bold **patient**); comments → "Do you or the patient have any comments after the task?" `src/pages/patient/TaskDetailPage.jsx`
- [x] **Q8** Task page "Home" button → label "Back" (goes to schedule). `TaskDetailPage.jsx`
- [x] **Q9** Task page "Scheduled for 9:00 AM" → include date: "Scheduled for 9:00 AM September 29". `TaskDetailPage.jsx`
- [x] **Q10** Patient profile: remove "Message your Therapist" card. `src/pages/patient/PatientProfilePage.jsx:~127`
- [x] **Q11** Patient profile: keep name edit, remove "Condition / diagnosis" field + display. `PatientProfilePage.jsx`
- [x] **Q12** Show/hide password toggle on login + signup. `src/pages/auth/LoginPage.jsx`, `SignUpPage.jsx`, maybe `src/components/ui/Input.jsx`
- [x] **Q13** Signup: confirm-password field with mismatch validation. `SignUpPage.jsx`
- [x] **Q14** Delete-task confirmation modal for therapists. `src/pages/therapist/TaskAssignmentPage.jsx`, `src/components/ui/Modal.jsx`
- [ ] **Q15** (WAITING on logo file from user) Replace logo everywhere with new HabitOT logo (house + figure + clipboard). Current: `public/habitot-icon.png`, `public/favicon.svg`, used in `Sidebar.jsx:73`, `LoginPage.jsx:56`, `SignUpPage.jsx:52`, `index.html`. **ASK** user for the new logo file (it's only embedded in the PDF).
- [ ] **Q16** (template text given to user; needs pasting in Supabase dashboard) Confirmation email must mention "HabitOT" — this is a Supabase Auth email template (dashboard → Auth → Email Templates), not repo code. Give user the template text to paste.

## P3 — Logic / behavior changes
- [x] **L1** Therapist dashboard consistency: rolling last 30 days through today, and only tasks assigned by THIS therapist. `TherapistDashboard.jsx`, `src/components/therapist/AggregatedStatsCard.jsx`, `PatientCard.jsx`, `PatientsPage.jsx`
- [x] **L2** Patient Progress consistency: rolling last 30 days through today. Streak logic unchanged. `ProgressPage.jsx:~79`, `src/utils/streak.js`
- [x] **L3** Patient Progress: remove Mood Summary (patient view only); move "Therapy Session Remarks" section to the Today page. `ProgressPage.jsx`, `PatientDashboard.jsx`
- [x] **L4** Remarks flip direction: remove remark input from patient schedule; add remark input for THERAPIST in patient calendar "Selected day" panel (therapist → patient feedback). Patient sees them on Today page (L3). `SchedulePage.jsx`, `src/components/therapist/ReadOnlyCalendar.jsx`, table `daily_remarks` (needs author/therapist_id + RLS change → migration).
- [x] **L5** Therapist dashboard recent feedback: show entries even with mood only (no text), with date. `src/components/therapist/PatientFeedbackList.jsx`
- [x] **L6** Patients can't start future-dated tasks — view-only until assigned day (today or past OK). `TaskDetailPage.jsx`, `SchedulePage.jsx`
- [x] **L7** Task page split: step 1 = description + photo proof; after proof, "Next" enables → step 2 = mood + comments → Submit. (PDF offered "Next" step or pop-up; default to the Next-step flow.) `TaskDetailPage.jsx`
- [x] **L8** Message unread badge on Messages tab; other notifications stay on Notifications tab (both roles). `Sidebar.jsx`, `NotificationContext.jsx`
- [x] **L9** Notification click navigates to target (e.g. new task → that task; message → thread), also for toasts. `NotificationsPage.jsx`, `NotificationContext.jsx`, `src/components/ui/Toast.jsx`
- [x] **L10** Therapist Patients list: show number of missed tasks per patient (PDF p.3, vague). `PatientCard.jsx`, `PatientsPage.jsx`

## P4 — Bigger features
- [x] **F1** Therapist: edit a task after posting. `TaskAssignmentPage.jsx`
- [ ] **F2** (SKIPPED for now per user) Therapist: schedule a task (create now, publish/visible at a future time?). **ASK** what "schedule" means vs. existing due date.
- [x] **F3** Therapist: new "Calendar" sidebar tab showing tasks for all their patients. New page + route in `src/App.jsx`, reuse `ReadOnlyCalendar.jsx`.
- [x] **F4** Patient: edit submission after completion (re-upload photo when therapist asks). `TaskDetailPage.jsx`, storage + task_assignments update/RLS.
- [x] **F5** Patient: allow at least 2 proof photos. `TaskDetailPage.jsx`, `src/utils/imageCompress.js`, schema (photo_url → array or new table → migration).
- [x] **F6** Mobile: allow choosing from photo library, not just camera (likely remove `capture` attr on file input). `TaskDetailPage.jsx`
- [x] **F7** Reminder notification 1 hour before a task is due. `supabase/functions/send-email-reminders` + cron / pg_cron.
- [x] **F8** Notification for overdue / uncompleted tasks same day. Same infra as F7.

## Open questions for the user
- New logo file (Q15).
- Meaning of "schedule a task" (F2).
- Mobile consistency display bug details (B9).
- Therapist "Client Notes" and "Profile" sections in the PDF are empty headings — assume no changes.

## Implementation notes (Oct 2026 pass)
- DB changes: `supabase/migration-2026-10-client-edits.sql` (seen_at on notifications, therapist_remarks table, proof_urls[], message trigger for all senders, new-task trigger with reference_id, in-app reminder cron). Must be run before deploying the frontend.
- Shared pieces: `src/components/ChatThread.jsx` (both chat pages), `src/components/ProofPhotos.jsx` + `src/utils/proofs.js`, `src/utils/notificationNav.js` (click-through routes), `calculateConsistency` in `src/utils/streak.js`.
- Badges: Notifications = unseen non-message notifications; Messages = unread messages (both in NotificationContext, with 15s polling fallback).
- Old patient `daily_remarks` are no longer shown anywhere; therapist remarks live in `therapist_remarks`.
- `src/pages/therapist/PatientsPage.jsx` is dead code (not routed).
