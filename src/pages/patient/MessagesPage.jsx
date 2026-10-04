import { useParams } from 'react-router-dom'
import ChatThread from '../../components/ChatThread'

export default function MessagesPage() {
  const { recipientId } = useParams()
  return <ChatThread otherId={recipientId} />
}
