-- Run after migration-2026-10-stats.sql. Every row should say "ok".
SELECT 'H6 stats functions exist' AS check,
  CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname IN ('therapist_patient_summary', 'therapist_daily_counts')) = 2 THEN 'ok' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'H6 not callable without signing in',
  CASE WHEN NOT has_function_privilege('anon', 'public.therapist_patient_summary(uuid[], date, date)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.therapist_daily_counts(uuid[], date, date)', 'EXECUTE') THEN 'ok' ELSE 'OPEN TO ANON' END;
