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

## Round 2 (`HabitOT-Product-Development-Revisions-2-2.pdf`, 2026-10-18, commit bd2d9e0)
Plan: `~/.claude/plans/create-a-plan-for-melodic-crescent.md`. Migration `supabase/migration-2026-10-revisions-2.sql` (+ `-verify.sql`) must be pasted by the user.
- Dashboard cards are links → `/therapist/patients`, `/therapist/today` (TodayTasksPage), `/therapist/consistency` (ConsistencyPage, no sidebar entry), `/therapist/client-notes/recent`. Task Completion + Mood charts removed from the dashboard; they live on PatientDetailPage with a Week/Month/Overall `PeriodToggle`.
- Timeframes (`src/utils/streak.js`): `getRange(period, offset, firstDate)` (week = Sun–Sat), `calculateConsistency(tasks, range?)` (no range = overall), `dailyCompletion`. Consistency = whole history; assigned/completed/missed = this week. Shared chart `components/therapist/CompletionChart.jsx`.
- Naming (client revised this on 2026-10-19; there is no "Patient Feedback" tab any more):
  - The sidebar tab **Client Notes** is `/therapist/notes` (`TherapistNotesPage`). Per patient, it merges task-feedback comments with `caregiver_notes`, newest first, and caregiver notes can be marked read there.
  - The dashboard card "Unread Client Notes" goes to `/therapist/client-notes/recent` (`ClientNotesPage`). That page lists **only unread** caregiver notes; marking one read removes it. Its "See All Client Notes" link goes to `/therapist/notes`.
  - `/therapist/client-notes` redirects to `/therapist/notes`.
  - Read status uses `therapist_read_at` and RPC `mark_client_note_read`.
  - Since 2026-10-20, task comments (`task_feedback.note`) also have `therapist_read_at`, set via RPC `mark_task_feedback_read` (migration `migration-2026-10-feedback-read.sql`). They count as unread client notes too.
  - Shared logic for both kinds of note is in `utils/clientNotes.js`: `fetchUnreadClientNotes`, `countUnreadClientNotes`, `markClientNoteRead`.
- Patient page: Consistency follows the period toggle via `calculateConsistency(allTasks, range)`. The Overall period's key is `'all'`. The Assigned/Completed cards stay on this week.
- "No tasks for today" = `task_assignments` row with `is_rest_day = true`, no time (`utils/restDay.js`); excluded from counts everywhere; trigger skips its notification.
- Multiple links stored newline-separated in `resource_url` (`getResourceLinks`, `joinLinks`); multiple dates insert one row per date (`utils/assignTask.js`, `components/therapist/TaskFields.jsx`).
- Calendar colours: `dayStatus` / `DAY_STATUS_CLASS` in `utils/tasks.js` (green done, red incomplete for today/past only). "Incomplete" filter is derived (past + not completed).
- Archive patients: `patient_assignments.archived_at` via RPC `set_patient_archived`; `utils/patients.js#fetchTherapistPatients` hides archived.
- Notifications: X removed; Archive sets `read_at`, Inbox/Archived tabs; DELETE policy dropped.
- Message search in `ChatThread.jsx` (ilike over the conversation, jump to result).
- Video proof: see the section below.

## Video proof (2026-10-19)
The client estimates 56 patients (8 therapists × 7), at least 1 task per weekday, and videos of 1 minute or less.
- **Storage:** Cloudflare R2, private bucket `habitot-proof-videos`. Photos stay in the Supabase `task-proofs` bucket.
  - An R2 lifecycle rule deletes objects **10 days** after upload. `RETENTION_DAYS` in `src/utils/proofs.js` and `R2_RETENTION_DAYS` (default 10) in the function must match it.
  - Bucket CORS allows `http://localhost:5173` and `https://habitot.vercel.app`, for GET and PUT with the `content-type` header. A new origin (custom domain, other dev port) has to be added in Cloudflare.
  - Supabase secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- **Edge Function `supabase/functions/proof-video`** (deploy: `supabase functions deploy proof-video --project-ref afzprgdowymgvmxtrqzc`):
  - It signs R2 URLs itself with SigV4 over Web Crypto; there's no SDK.
  - `upload` signs Content-Length, which enforces the 15 MB cap.
  - `confirm` writes `task_assignments.proof_video` (`{key,size,uploaded_at,duration}`, migration `migration-2026-10-proof-video.sql`) and deletes the replaced object.
  - `view` returns a 1-hour GET URL, or `{expired:true}`.
- **Frontend:**
  - `components/VideoRecorder.jsx` uses MediaRecorder at 1.2 Mbps + 64 kbps, which is about 9.5 MB per minute. It prefers MP4 so iPhones can play the videos, and stops automatically at 60 s.
  - Patients can also **upload from the gallery** ("Upload a video"). `utils/videoCompress.js#compressVideo` prepares the file:
    - Clips over 60 s are refused.
    - Small mp4/webm files of 15 MB or less pass through unchanged.
    - Everything else is transcoded to ≤720p H.264/AAC MP4 at the same bitrates using **Mediabunny** (pinned 1.61.2, WebCodecs, lazy `import()`). On desktop, a 60 s 1080p clip of 87 MB became 8.7 MB in about 12 s.
    - If there's no WebCodecs, or the conversion fails, it falls back to real time: canvas `captureStream` plus MediaRecorder.
    - Gotcha: `new Quality(number)` is a 0–1 *quality level*. Bitrates must be passed as `new Quality({ bitrate })`.
  - Local testing of the R2 upload must run on port **5173**, the only localhost origin in the bucket's CORS rule. Port 5199 gets a CORS error.
  - Other files: `components/ProofVideo.jsx` (player and "expired" label) and `utils/proofVideo.js` (upload with XHR progress).
  - TaskDetailPage has Photo/Video tabs; either one satisfies `requires_proof`.
- **Budget:** worst case is 10 days × 56 patients × 15 MB = about 6.3 GB, inside R2's 10 GB free tier. There is deliberately no total-storage check; the user chose that.

## Full-app test & fixes (2026-10-20)
- **Security** (`supabase/migration-2026-10-security.sql` + `-verify.sql`, pasted by the user). The user chose to leave C1 (open therapist signup) out. The migration adds:
  - Trigger `protect_profile_columns`: users can't change their own `email`/`role`.
  - Trigger `limit_patient_task_updates`: patients may only change `status`, `completed_at`, `proof_url`, `proof_urls`. **A new patient-editable task column must be added to its `allowed` array.**
  - The messages INSERT check now requires a `patient_assignments` link between sender and recipient. The task_feedback INSERT check requires the task to be the patient's own.
  - Cron-only functions have their grants revoked. `check_overdue_tasks` gets a real caller check and an advisory lock.
  - Unique index `task_assignments_one_rest_day`; `restDay.js` treats a 23505 as success.
  - `email_log.provider_id`.
- **Reminder emails**: `utils/assignTask.js#syncTaskReminder(taskId)` → `send-email-reminders` `{type:'sync_task_reminder', task_id}`.
  - Called after create (today only), edit, delete (TaskAssignmentPage) and complete (TaskDetailPage).
  - The function checks the caller's JWT (task's therapist or patient), cancels the queued Resend email (`/emails/{id}/cancel`) and re-queues it if still needed. The send time is never before `publish_at`.
  - The old body type `task_reminder_immediate` is accepted, with the same check. Titles are HTML-escaped.
  - **Open issue:** Resend rejects sends because the `itsbydan.com` domain isn't verified, so no reminder emails were going out. `email_log` was empty for 7 days. The user must verify the domain in Resend or change `FROM_EMAIL`.
- **Efficiency:**
  - All pages except login/signup are `React.lazy` (App.jsx), with Suspense in DashboardLayout. The main bundle went from 984 KB to 455 KB (277 → 133 KB gzipped).
  - `utils/fetchAll.js#fetchAllRows` pages through full-history task queries, since Supabase caps responses at 1000 rows and `.range` can't exceed that.
  - The dashboard counts unread client notes with a head/count query.
  - ChatThread relies on NotificationContext's `messageTick` (no own channel; 30 s fallback poll).
  - ProofPhotos signs with `createSignedUrls` in one call.
- Login keeps deep links: ProtectedRoute passes `state.from`, and LoginPage returns there if the path is the user's role's.
- Patient lookup by email is lowercased.
- Test scripts (session scratchpad, not in the repo): `crawl.cjs` (every route, phone + desktop), `flows.cjs` (19 flow and edge-case checks), `sec-check.mjs` (security probes, each reverted), `email-fn-test.mjs`. Run them on port 5173, or 4173 for `vite preview`.

## How to work / test
- Read only the files relevant to the change, then run `npm run build` and `npx eslint src`.
- New DB changes go in a new `supabase/migration-*.sql` plus a `-verify.sql`; the user pastes them into the SQL Editor after pushing. The Supabase CLI *is* authenticated and linked here (`supabase db query --linked -o table "..."`, `supabase inspect db ...`, `supabase functions deploy`), so use it for read-only checks; don't run destructive SQL against production without asking.
- Keep frontend changes working before a migration runs, e.g. `select('*')` and only send new columns when they're used.
- Local run: `.env.local` (gitignored) points at the live project `afzprgdowymgvmxtrqzc`. Start with `npx vite --port 5199`.
- Test accounts: `therapst1@gmail.com` (note the spelling) and `patient1@gmail.com`; ask the user for the password. They are linked (therapist ↔ patient).
- There's no browser MCP tool in this setup. For UI testing, install `playwright-core` in the session scratchpad (not the project) and use `chromium.launch({ channel: 'msedge' })`; Edge is installed.
- For mobile checks, use a 390x844 viewport and check `scrollWidth`, tap sizes ≥ 40px, and input font size ≥ 16px.
- Prefix test data with `[test]` and delete it afterwards. The client clock runs slightly ahead of the server, so don't filter by `created_at >= localNow`.
- Commit message style: `<Month> <day> <summary>`.
