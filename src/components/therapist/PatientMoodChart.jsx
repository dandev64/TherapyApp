import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { BarChart3 } from 'lucide-react'

const MOOD_CONFIG = {
  excited: { emoji: '🤩', color: '#f59e0b' },
  happy: { emoji: '😊', color: '#22c55e' },
  calm: { emoji: '😌', color: '#3b82f6' },
  scared: { emoji: '😨', color: '#8b5cf6' },
  anxious: { emoji: '😰', color: '#f97316' },
  angry: { emoji: '😠', color: '#ef4444' },
  tired: { emoji: '😴', color: '#6b7280' },
  sad: { emoji: '😢', color: '#1e40af' },
}

export { MOOD_CONFIG }

export default function PatientMoodChart({ feedback, title = 'Mood Summary', subtitle = '(last 30 days)' }) {
  const moodCounts = {}
  Object.keys(MOOD_CONFIG).forEach((m) => { moodCounts[m] = 0 })
  feedback.forEach((f) => {
    if (moodCounts[f.mood] !== undefined) moodCounts[f.mood]++
  })
  const moodData = Object.entries(MOOD_CONFIG).map(([key, { emoji, color }]) => ({
    mood: key,
    emoji,
    color,
    count: moodCounts[key],
  }))

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 size={18} className="text-primary" />
        <h3 className="text-lg font-bold text-text-primary">{title}</h3>
        {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
      </div>
      {feedback.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">
          No mood data yet.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={moodData} barCategoryGap="20%">
            <XAxis dataKey="emoji" tick={{ fontSize: 18 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#757c7e' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              formatter={(value, name, { payload }) => [value, payload.mood]}
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {moodData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
