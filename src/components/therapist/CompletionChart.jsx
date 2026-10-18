import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts'

function barColor(percent) {
  if (percent >= 80) return '#22c55e'
  if (percent >= 50) return '#f59e0b'
  if (percent > 0) return '#ef4444'
  return '#e5e7eb'
}

const shortDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Groups daily rows into 7-day buckets so long histories stay readable. */
function bucketByWeek(days) {
  const out = []
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7)
    const total = chunk.reduce((s, d) => s + d.total, 0)
    const completed = chunk.reduce((s, d) => s + d.completed, 0)
    out.push({
      date: chunk[0].date,
      label: shortDate(chunk[0].date),
      total,
      completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    })
  }
  return out
}

/**
 * Daily completion % bar chart (Y: 0-100%).
 * `days` comes from dailyCompletion(); `period` picks the X-axis labels.
 */
export default function CompletionChart({ days, period, height = 220 }) {
  let data
  if (period === 'week') {
    data = days.map((d) => ({ ...d, label: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) }))
  } else if (period === 'month') {
    data = days.map((d) => ({ ...d, label: String(Number(d.date.slice(8))) }))
  } else {
    data = days.length > 62 ? bucketByWeek(days) : days.map((d) => ({ ...d, label: shortDate(d.date) }))
  }

  if (!data.some((d) => d.total > 0)) {
    return <p className="text-sm text-text-muted text-center py-12">No task data for this period.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barCategoryGap="15%">
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#757c7e' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: '#757c7e' }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          formatter={(value, name, { payload }) => [`${payload.completed}/${payload.total} tasks (${value}%)`, 'Completion']}
          labelFormatter={(label, items) => (items?.[0] ? shortDate(items[0].payload.date) + (period === 'all' && days.length > 62 ? ' (week)' : '') : label)}
          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
        />
        <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
          {data.map((entry) => <Cell key={entry.date} fill={barColor(entry.percent)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
