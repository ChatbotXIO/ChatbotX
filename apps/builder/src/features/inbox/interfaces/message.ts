type MessageType = "text" | "image" | "markdown" | "audio" | "video" | "file" | "location" | "carousel" | "card" | "dropdown" | "choice" | "bloc"
type MessageDirection = "sent" | "received"

export interface Message {
  id: string
  chatbotId: string
  conversationId: string
  messageType: MessageType
  content: string
  direction: MessageDirection
  createdAt: string
  updatedAt: string
}
