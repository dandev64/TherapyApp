# HabitOT — System Review Fix Progress

## Context
Implementing fixes from comprehensive code review, one by one with user approval.

## Completed
- ~~#1 Error handling~~ — Added error state + banners across all pages
- ~~#2 NotificationContext~~ — Fixed stale closure with useRef, toast timeout cleanup
- ~~#3 PatientCard warning~~ — Changed from weekly to daily check, removed unused weekly query

## Next Up

### 4. ReadOnlyCalendar — daily_remarks not filtered by therapist_id
**File:** [ReadOnlyCalendar.jsx](src/components/therapist/ReadOnlyCalendar.jsx) lines 41-46
**Problem:** Shows all therapists' remarks for a patient, not just the logged-in therapist's. RLS prevents unauthorized access but the query returns more data than intended.
**Fix:** Add `.eq('therapist_id', therapistId)` to the daily_remarks query.

### 5. Modal accessibility issues
**File:** [Modal.jsx](src/components/ui/Modal.jsx)
- No ESC key to close
- No focus trap (focus can tab to elements behind modal)
- Body overflow not cleaned up if component unmounts while open

### 6. Toast timeout memory leak
**File:** [Toast.jsx](src/components/ui/Toast.jsx) lines 65-67
**Problem:** Auto-dismiss timeout not cleared when user manually dismisses. Multiple rapid notifications accumulate orphaned timeouts.

---

## PERFORMANCE ISSUES

### 7. N+1 queries in TherapistDashboard
**File:** [TherapistDashboard.jsx](src/pages/therapist/TherapistDashboard.jsx)
**Problem:** Fetches enriched data for each patient separately in a loop. With 20 patients = 20+ individual queries.
**Fix:** Batch queries or use a single query with joins.

### 8. `select('*')` over-fetching
**Multiple files** use `select('*')` when only a few columns are needed. This transfers unnecessary data.

### 9. useCachedState grows indefinitely
**File:** [useCachedState.js](src/hooks/useCachedState.js)
**Problem:** Global `Map` cache never evicts entries. Long sessions accumulate stale data.

### 10. Streak calculation loads 500 rows
**File:** [PatientDashboard.jsx](src/pages/patient/PatientDashboard.jsx)
**Problem:** Loads up to 500 task_assignments every render for streak calculation. Could use a server-side function instead.

---

## UX IMPROVEMENTS

### 11. No "Forgot Password" link on login page
**File:** [LoginPage.jsx](src/pages/auth/LoginPage.jsx)

### 12. No success feedback after actions
Template creation, task assignment, and patient addition show no success toast/message — user has to infer success from the modal closing.

### 13. PatientDetailPage — no link to create templates
**File:** [PatientDetailPage.jsx](src/pages/therapist/PatientDetailPage.jsx) lines 396-399
When no templates exist, shows "No templates yet" but no link to TaskTemplatesPage.

### 14. TherapistProfilePage hardcodes "Occupational Therapist"
**File:** [TherapistProfilePage.jsx](src/pages/therapist/TherapistProfilePage.jsx)
Should read from profile data or be configurable.

### 15. Console.log left in production
**File:** [NotificationsPage.jsx](src/pages/therapist/NotificationsPage.jsx) lines 79-102
Extensive debug logging should be removed.

---

## DATABASE / SCHEMA

### 16. Missing index on `task_assignments(therapist_id, assigned_date)`
Therapist dashboards query by therapist + date constantly. This composite index would speed up all therapist views.

### 17. Task templates RLS too permissive
**File:** schema.sql lines 94-103
All therapists can see all templates. Should restrict to own templates only.

---

## MINOR ISSUES

- **No `prefers-reduced-motion` support** — animations play for all users
- **Button component** missing explicit `type="button"` default (causes accidental form submissions)
- **Hardcoded colors** in PatientMoodChart duplicate the theme system
- **No error boundary** — one component crash kills the entire page
- **ProtectedRoute** has no timeout for infinite profile loading spinner

---

## RECOMMENDED PRIORITY ORDER

| Priority | Items | Effort |
|----------|-------|--------|
| **P0 — Bugs** | #1 error handling, #2 stale closure, #3 text mismatch, #4 remarks filter | Medium |
| **P1 — UX** | #5 modal a11y, #11 forgot password, #12 success feedback, #13 template link | Small each |
| **P2 — Perf** | #7 N+1 queries, #8 select fields, #16 missing index | Medium |
| **P3 — Polish** | #6 toast leak, #9 cache, #14 hardcoded title, #15 console.log, #17 RLS | Small each |

## Verification
- Run the app and test each role (patient, therapist, caregiver)
- Trigger error states by temporarily breaking Supabase connection
- Check modal keyboard navigation (Tab, ESC)
- Verify therapist dashboard with 5+ patients for performance
