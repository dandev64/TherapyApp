import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../utils/fetchAll'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { calculateConsistency, dailyCompletion, firstTaskDate, getRange } from '../../utils/streak'
import { fetchTherapistPatients } from '../../utils/patients'
import PeriodToggle from '../../components/PeriodToggle'
import CompletionChart from '../../components/therapist/CompletionChart'
import Card from '../../components/ui/Card'
import { ArrowLeft, TrendingUp } from 'lucide-react'

function pctClass(p) {
  if (p >= 80) return 'text-green-600'
  if (p >= 50) return 'text-amber-600'
  return 'text-red-500'
}

/**
 * Consistency drill-down, reached only from the dashboard's Avg Consistency card.
 * Week / Month / Overall, with ‹ › to look at earlier weeks or months.
 */
export default function ConsistencyPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients] = useCachedState('therapist-consistency-patients', [])
  const [tasks, setTasks] = useCachedState('therapist-consistency-tasks', [])
  const [loading, setLoading] = useState(() => !hasCache('therapist-consistency-tasks'))
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('week')
  const [offset, setOffset] = useState(0)

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function load() {
      const { data: links, error: pErr } = await fetchTherapistPatients(profile.id)
      if (pErr) { setError('Failed to load patients.'); setLoading(false); return }
      const ids = links.map((l) => l.patient_id)
      const { data, error: tErr } = ids.length
        ? await fetchAllRows(() => supabase
          .from('task_assignments')
          .select('patient_id, assigned_date, status, is_rest_day')
          .eq('therapist_id', profile.id)
          .in('patient_id', ids))
        : { data: [] }
      if (cancelled) return
      if (tErr) { setError('Failed to load tasks.'); setLoading(false); return }
      setError(null)
      setPatients(links.map((l) => l.profiles))
      setTasks(data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [profile])
  /* eslint-enable react-hooks/exhaustive-deps */

  const range = getRange(period, offset, firstTaskDate(tasks))

  const byPatient = {}
  tasks.forEach((t) => {
    if (!byPatient[t.patient_id]) byPatient[t.patient_id] = []
    byPatient[t.patient_id].push(t)
  })
  const rows = patients
    .map((p) => ({ ...p, ...calculateConsistency(byPatient[p.id] || [], range) }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  const withTasks = rows.filter((r) => r.total > 0)
  const average = withTasks.length
    ? Math.round(withTasks.reduce((s, r) => s + r.percent, 0) / withTasks.length)
    : 0
  const days = dailyCompletion(tasks, range)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/therapist')}
          aria-label="Back to dashboard"
          className="p-2 -ml-2 rounded-xl hover:bg-surface-alt transition-colors cursor-pointer text-text-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Task Consistency</h2>
          <p className="text-text-secondary mt-1">Completed tasks as a share of tasks assigned, across your active patients</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">{error}</div>
      )}

      <PeriodToggle period={period} onPeriodChange={setPeriod} offset={offset} onOffsetChange={setOffset} label={range.label} />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <Card className="!p-6">
            <p className="text-sm text-text-secondary">
              Average Consistency: <span className={`text-2xl font-extrabold font-heading ${pctClass(average)}`}>{average}%</span>
            </p>
            <div className="flex items-center gap-2 mt-5 mb-4">
              <TrendingUp size={18} className="text-primary" />
              <h3 className="text-lg font-bold text-text-primary">Task Completion</h3>
              <span className="text-xs text-text-muted">{range.label}</span>
            </div>
            <CompletionChart days={days} period={period} />
          </Card>

          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[28rem]">
                <thead>
                  <tr className="border-b border-border bg-surface-alt/30">
                    <th className="text-left px-4 sm:px-5 py-3 text-xs font-bold text-text-muted uppercase tracking-wider">Patient</th>
                    <th className="text-center px-3 py-3 text-xs font-bold text-text-muted uppercase tracking-wider">Assigned</th>
                    <th className="text-center px-3 py-3 text-xs font-bold text-text-muted uppercase tracking-wider">Completed</th>
                    <th className="text-center px-3 py-3 text-xs font-bold text-text-muted uppercase tracking-wider">Missed</th>
                    <th className="text-center px-3 py-3 text-xs font-bold text-text-muted uppercase tracking-wider">Consistency</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">No active patients.</td></tr>
                  ) : rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/therapist/patients/${r.id}`)}
                      className="border-b border-border/50 last:border-0 hover:bg-primary-container/10 transition-colors cursor-pointer"
                    >
                      <td className="px-4 sm:px-5 py-3 font-semibold text-text-primary">{r.full_name}</td>
                      <td className="text-center px-3 py-3 text-text-secondary">{r.total}</td>
                      <td className="text-center px-3 py-3 text-text-secondary">{r.completed}</td>
                      <td className={`text-center px-3 py-3 font-semibold ${r.missed > 0 ? 'text-red-500' : 'text-text-muted'}`}>{r.missed}</td>
                      <td className="text-center px-3 py-3">
                        {r.total > 0
                          ? <span className={`font-bold ${pctClass(r.percent)}`}>{r.percent}%</span>
                          : <span className="text-text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
