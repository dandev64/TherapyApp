import { supabase } from '../lib/supabase'
import { getRange, toDateStr } from './streak'

/*
 * Task stats computed in the database (therapist_patient_summary / therapist_daily_counts), so the
 * therapist pages don't download every task ever assigned. The SQL follows the
 * same rules as streak.js; "today" and the week come from the browser.
 */

const PAGE_SIZE = 1000

/**
 * One summary per patient: today's progress, overall consistency, tasks missed
 * this week and the streak. Returns { data: { [patientId]: summary }, error }.
 * Patients with no tasks are missing from the result; use emptySummary().
 */
export async function fetchPatientSummaries(patientIds) {
  if (!patientIds.length) return { data: {}, error: null }
  const { data, error } = await supabase.rpc('therapist_patient_summary', {
    p_patient_ids: patientIds,
    p_today: toDateStr(new Date()),
    p_week_from: getRange('week').from,
  })
  if (error) return { data: null, error }
  const byPatient = {}
  for (const r of data || []) {
    byPatient[r.patient_id] = {
      totalToday: r.total_today,
      completedToday: r.completed_today,
      restDayToday: r.rest_today,
      streak: r.streak,
      consistency: r.overall_total > 0 ? Math.round((r.overall_completed / r.overall_total) * 100) : 0,
      hasTasks: r.overall_total > 0,
      missed: r.week_missed,
    }
  }
  return { data: byPatient, error: null }
}

export function emptySummary() {
  return { totalToday: 0, completedToday: 0, restDayToday: false, streak: 0, consistency: 0, hasTasks: false, missed: 0 }
}

/**
 * Per patient per day counts between `from` (null = first task) and `to`,
 * expanded into one lightweight row per task so the streak.js helpers
 * (calculateConsistency, dailyCompletion, firstTaskDate) work on them unchanged.
 */
export async function fetchDailyTaskRows(patientIds, from, to) {
  if (!patientIds.length) return { data: [], error: null }
  const counts = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc('therapist_daily_counts', { p_patient_ids: patientIds, p_from: from, p_to: to })
      .order('patient_id')
      .order('assigned_date')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    counts.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  const rows = []
  for (const c of counts) {
    for (let i = 0; i < c.total; i++) {
      rows.push({ patient_id: c.patient_id, assigned_date: c.assigned_date, status: i < c.completed ? 'completed' : 'pending', is_rest_day: false })
    }
    if (c.rest) rows.push({ patient_id: c.patient_id, assigned_date: c.assigned_date, status: 'pending', is_rest_day: true })
  }
  return { data: rows, error: null }
}
