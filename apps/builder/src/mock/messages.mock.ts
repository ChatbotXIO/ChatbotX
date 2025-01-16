import { type Message, MessageType, SenderType } from "@ahachat.ai/database"
import { generateRandomId, getRandomFromZeroToN } from "./common.mock"

const getRandomMessageType = (): string => {
  const messageTypes: string[] = [
    MessageType.Text,
    MessageType.Image,
    MessageType.Audio,
    MessageType.Video,
    MessageType.File,
    MessageType.Location,
    // 'markdown', 'carousel', 'card', 'dropdown', 'choice', 'bloc'
  ]
  return messageTypes[getRandomFromZeroToN(messageTypes.length)] || "text"
}

const getRandomContent = (type: string): string | null => {
  switch (type) {
    case MessageType.Text:
      return "Đây là một tin nhắn văn bản ngẫu nhiên."
    case MessageType.Image:
      return JSON.stringify({
        imageUrl: `https://picsum.photos/200/300?random=${Math.floor(Math.random() * 1000)}`,
      })
    case MessageType.Audio:
      return JSON.stringify({
        audioUrl: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3?random=${Math.floor(Math.random() * 1000)}`,
      })
    case MessageType.Video:
      return JSON.stringify({
        videoUrl: `https://www.w3schools.com/html/mov_bbb.mp4?random=${Math.floor(Math.random() * 1000)}`,
      })
    case MessageType.File:
      return JSON.stringify({
        fileUrl: `https://example.com/file${Math.floor(Math.random() * 1000)}.pdf`,
        fileName: `file${Math.floor(Math.random() * 1000)}.pdf`,
      })
    case MessageType.Location:
      return JSON.stringify({
        location: {
          lat: 21.0285 + Math.random() * 0.1,
          lng: 105.8542 + Math.random() * 0.1,
        },
      })
    // case 'markdown':
    //   return { markdownContent: "### This is markdown content\n\n- Item 1\n- Item 2" };
    // case 'carousel':
    //   return 'Carousel content here';
    // case 'card':
    //   return 'Card content here';
    // case 'dropdown':
    //   return 'Dropdown content here';
    // case 'choice':
    //   return 'Choice content here';
    // case 'bloc':
    //   return 'Bloc content here';
    default:
      return ""
  }
}

export const generateRandomMessage = (chatbotId: string): Message => {
  const messageType = getRandomMessageType()
  const senderType = [SenderType.Contact, SenderType.User][
    Math.floor(Math.random() * 2)
  ]

  return {
    id: generateRandomId(),
    inboxId: generateRandomId(),
    chatbotId: chatbotId,
    conversationId: generateRandomId(),
    messageType: messageType as MessageType,
    content: getRandomContent(messageType),
    senderType: senderType as SenderType,
    senderId: generateRandomId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
