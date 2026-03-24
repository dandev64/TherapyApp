import Card from '../ui/Card'
import { MOOD_CONFIG } from './PatientMoodChart'

export default function PatientFeedbackList({ feedbackNotes }) {
  if (feedbackNotes.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-6">
        No feedback notes yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {feedbackNotes.map((f) => {
        const moodInfo = MOOD_CONFIG[f.mood] || {}
        return (
          <Card key={f.id} className="!p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">{moodInfo.emoji || '❓'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-text-secondary capitalize">{f.mood}</span>
                  <span className="text-xs text-text-muted">
                    {new Date(f.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <p className="text-sm text-text-primary mt-1">{f.note}</p>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
