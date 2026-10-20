import { useParams } from 'react-router-dom'
import ChatThread from '../../components/ChatThread'

export default function TherapistMessagesPage() {
  const { patientId } = useParams()
  // Keyed so switching conversations starts a fresh thread
  return <ChatThread key={patientId} otherId={patientId} />
}
