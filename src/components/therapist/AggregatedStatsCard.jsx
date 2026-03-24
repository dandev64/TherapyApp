import Card from '../ui/Card'
import { Users, CheckCircle, AlertTriangle, Heart } from 'lucide-react'
import { MOOD_CONFIG } from './PatientMoodChart'

export default function AggregatedStatsCard({ patients, weeklyFeedback }) {
  const totalPatients = patients.length
  const avgConsistency = totalPatients > 0
    ? Math.round(patients.reduce((sum, p) => sum + p.consistency, 0) / totalPatients)
    : 0
  const allDoneToday = patients.filter((p) => p.totalToday > 0 && p.completedToday === p.totalToday).length
  const noActivity = patients.filter((p) => p.totalToday > 0 && p.completedToday === 0).length

  // Most common mood this week
  const moodCounts = {}
  weeklyFeedback.forEach((f) => {
    moodCounts[f.mood] = (moodCounts[f.mood] || 0) + 1
  })
  let topMood = null
  let topCount = 0
  Object.entries(moodCounts).forEach(([mood, count]) => {
    if (count > topCount) { topMood = mood; topCount = count }
  })
  const topMoodInfo = topMood ? MOOD_CONFIG[topMood] : null

  const stats = [
    {
      label: 'Total Patients',
      value: totalPatients,
      icon: Users,
      bgColor: 'bg-primary-container',
      color: 'text-primary',
    },
    {
      label: 'Avg Consistency',
      value: `${avgConsistency}%`,
      icon: CheckCircle,
      bgColor: 'bg-success-bg',
      color: 'text-success',
    },
    {
      label: 'All Done Today',
      value: allDoneToday,
      icon: CheckCircle,
      bgColor: 'bg-secondary-container',
      color: 'text-secondary',
    },
    {
      label: 'No Activity',
      value: noActivity,
      icon: AlertTriangle,
      bgColor: 'bg-danger-bg',
      color: 'text-danger',
    },
  ]

  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
          Patient Overview
        </h3>
        {topMoodInfo && (
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Heart size={12} className="text-primary" />
            Top mood: {topMoodInfo.emoji} {topMood}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, bgColor, color }) => (
          <div key={label} className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${bgColor} ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xl font-extrabold text-text-primary font-heading">{value}</p>
              <p className="text-[10px] font-medium text-text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
