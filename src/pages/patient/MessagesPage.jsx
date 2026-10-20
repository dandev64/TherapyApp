import { useParams } from 'react-router-dom'
import ChatThread from '../../components/ChatThread'

export default function MessagesPage() {
  const { recipientId } = useParams()
  // Keyed so switching conversations starts a fresh thread
  return <ChatThread key={recipientId} otherId={recipientId} />
}
