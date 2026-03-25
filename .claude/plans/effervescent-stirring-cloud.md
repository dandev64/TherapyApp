# Rename App: "Simple Therapy" → "HabitOT"

## Context
Rebrand the app name from "Simple Therapy" to "HabitOT" across all locations. The icon stays as-is — only text changes needed.

## Text Replacements

| # | File | Change |
|---|------|--------|
| 1 | `index.html:7` | `<title>Simple Therapy</title>` → `<title>HabitOT</title>` |
| 2 | `package.json:2` | `"name": "simple-therapy"` → `"name": "habitot"` |
| 3 | `src/components/layout/Sidebar.jsx:61` | `Simple Therapy` → `HabitOT` |
| 4 | `src/pages/auth/LoginPage.jsx:48` | `Sign in to Simple Therapy` → `Sign in to HabitOT` |
| 5 | `src/pages/auth/SignUpPage.jsx:50` | `Join Simple Therapy` → `Join HabitOT` |
| 6 | `src/pages/therapist/PatientsPage.jsx:205` | `a Simple Therapy account` → `a HabitOT account` |
| 7 | `src/pages/therapist/PatientCarryoverPage.jsx:255` | `a Simple Therapy account` → `a HabitOT account` |

## Styling
The "HabitOT" text in the image uses a heavy/extrabold dark font. Update the sidebar `<h1>` from `font-bold` to `font-extrabold` to match the logo style.

## Verification
- Browser tab shows "HabitOT"
- Sidebar header says "HabitOT"
- Login/signup pages reference "HabitOT"
- Add Patient helper text says "HabitOT account"
