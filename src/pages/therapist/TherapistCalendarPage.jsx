import { useAuth } from '../../contexts/AuthContext'
import Card from '../../components/ui/Card'
import ReadOnlyCalendar from '../../components/therapist/ReadOnlyCalendar'

export default function TherapistCalendarPage() {
  const { profile } = useAuth()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Calendar</h2>
        <p className="text-text-secondary mt-2">Tasks for all your patients</p>
      </div>
      <Card>
        {profile && <ReadOnlyCalendar therapistId={profile.id} />}
      </Card>
    </div>
  )
}
