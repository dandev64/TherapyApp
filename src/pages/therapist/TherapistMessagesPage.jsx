import { useParams } from 'react-router-dom'
import ChatThread from '../../components/ChatThread'

export default function TherapistMessagesPage() {
  const { patientId } = useParams()
  return <ChatThread otherId={patientId} />
}
