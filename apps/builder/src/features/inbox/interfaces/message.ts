import { Contact } from "@/features/inbox/interfaces/conversation";
import { SenderType } from "@ahachat.ai/database";

export type MessageType = "text" | "image" | "audio" | "video" | "file" | "location" // | "markdown" | "carousel" | "card" | "dropdown" | "choice" | "bloc"

export interface MessageContent {
  imageUrl: string;
  audioUrl: string;
  videoUrl: string;
  fileUrl: string;
  fileName: string;
  location: { lat: number; lng: number };
  markdownContent: string;
}

export interface Message {
  id: string
  chatbotId: string
  conversationId: string
  messageType: MessageType
  content: string | Partial<MessageContent>
  senderType: SenderType,
  senderId?: string
  createdAt: string
  updatedAt: string
  isLoading: boolean
  user: Partial<Contact>
}
