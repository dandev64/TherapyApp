-- ============================================
-- HabitOT — task stats computed in the database (review finding H6)
-- ============================================
-- The therapist dashboard, Patients page and Consistency page downloaded every
-- task ever assigned to work out streaks and consistency in the browser. These
-- functions return the numbers instead: one row per patient, or one row per
-- patient per day.
--
-- Paste into the Supabase SQL Editor BEFORE pushing the matching frontend.
-- Read-only functions; safe to re-run. SECURITY INVOKER, so the task_assignments
-- RLS policy still applies, and only the caller's own tasks are counted.
--
-- "Today" and the week start come from the browser (p_today, p_week_from) so
-- the numbers match what the app showed before (src/utils/streak.js).
-- ============================================


-- Per patient: today's progress, overall consistency, missed this week, streak.
-- Same rules as getTodayProgress / calculateConsistency / calculateStreak:
--   - rest-day rows never count as tasks
--   - consistency counts tasks dated up to today
--   - missed = past days' tasks never completed
--   - streak = complete days going back from yesterday until the first day
--     with an unfinished task (days without tasks don't break it), plus today
--     if all of today's tasks are done
CREATE OR REPLACE FUNCTION public.therapist_patient_summary(
  p_patient_ids uuid[],
  p_today date,
  p_week_from date
)
RETURNS TABLE (
  patient_id uuid,
  total_today int,
  completed_today int,
  rest_today boolean,
  overall_total int,
  overall_completed int,
  week_missed int,
  streak int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH t AS (
    SELECT ta.patient_id, ta.assigned_date, ta.status,
      COALESCE(ta.is_rest_day, false) AS rest
    FROM public.task_assignments ta
    WHERE ta.therapist_id = auth.uid()
      AND ta.patient_id = ANY(p_patient_ids)
  ),
  past_days AS (
    SELECT t.patient_id, t.assigned_date, bool_and(t.status = 'completed') AS complete
    FROM t
    WHERE NOT t.rest AND t.assigned_date < p_today
    GROUP BY 1, 2
  ),
  last_unfinished AS (
    SELECT d.patient_id, max(d.assigned_date) AS day
    FROM past_days d
    WHERE NOT d.complete
    GROUP BY 1
  ),
  past_streak AS (
    SELECT d.patient_id, count(*) AS days
    FROM past_days d
    LEFT JOIN last_unfinished u ON u.patient_id = d.patient_id
    WHERE u.day IS NULL OR d.assigned_date > u.day
    GROUP BY 1
  ),
  agg AS (
    SELECT t.patient_id,
      count(*) FILTER (WHERE NOT t.rest AND t.assigned_date = p_today) AS total_today,
      count(*) FILTER (WHERE NOT t.rest AND t.assigned_date = p_today AND t.status = 'completed') AS completed_today,
      COALESCE(bool_or(t.rest AND t.assigned_date = p_today), false) AS rest_today,
      count(*) FILTER (WHERE NOT t.rest AND t.assigned_date <= p_today) AS overall_total,
      count(*) FILTER (WHERE NOT t.rest AND t.assigned_date <= p_today AND t.status = 'completed') AS overall_completed,
      count(*) FILTER (WHERE NOT t.rest AND t.assigned_date >= p_week_from AND t.assigned_date < p_today AND t.status <> 'completed') AS week_missed
    FROM t
    GROUP BY 1
  )
  SELECT a.patient_id,
    a.total_today::int,
    a.completed_today::int,
    a.rest_today,
    a.overall_total::int,
    a.overall_completed::int,
    a.week_missed::int,
    (COALESCE(s.days, 0)
      + CASE WHEN a.total_today > 0 AND a.total_today = a.completed_today THEN 1 ELSE 0 END)::int
  FROM agg a
  LEFT JOIN past_streak s ON s.patient_id = a.patient_id;
$$;

REVOKE ALL ON FUNCTION public.therapist_patient_summary(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.therapist_patient_summary(uuid[], date, date) TO authenticated;


-- Per patient per day: task and completed counts, and whether it was a rest day.
-- p_from NULL = from the first task. Used by the Consistency page.
CREATE OR REPLACE FUNCTION public.therapist_daily_counts(
  p_patient_ids uuid[],
  p_from date,
  p_to date
)
RETURNS TABLE (
  patient_id uuid,
  assigned_date date,
  total int,
  completed int,
  rest boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT ta.patient_id,
    ta.assigned_date,
    (count(*) FILTER (WHERE NOT COALESCE(ta.is_rest_day, false)))::int,
    (count(*) FILTER (WHERE NOT COALESCE(ta.is_rest_day, false) AND ta.status = 'completed'))::int,
    bool_or(COALESCE(ta.is_rest_day, false))
  FROM public.task_assignments ta
  WHERE ta.therapist_id = auth.uid()
    AND ta.patient_id = ANY(p_patient_ids)
    AND (p_from IS NULL OR ta.assigned_date >= p_from)
    AND ta.assigned_date <= p_to
  GROUP BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.therapist_daily_counts(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.therapist_daily_counts(uuid[], date, date) TO authenticated;
