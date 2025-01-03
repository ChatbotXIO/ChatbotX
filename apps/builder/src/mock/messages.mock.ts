import { Message, MessageContent, MessageType } from "@/features/inbox/interfaces/message";

import { generateRandomId, getRandomFromZeroToN } from './common.mock'
import { SenderType } from "@ahachat.ai/database";

const getRandomMessageType = (): string => {
  const messageTypes: string[] = [
    'text', 'image', 'audio', 'video', 'file', 'location',
    // 'markdown', 'carousel', 'card', 'dropdown', 'choice', 'bloc'
  ];
  return messageTypes[getRandomFromZeroToN(messageTypes.length)] || 'text';
};

const getRandomContent = (type: string): Partial<MessageContent> | string => {
  switch (type) {
    case 'text':
      return 'Đây là một tin nhắn văn bản ngẫu nhiên.';
    case 'image':
      return { imageUrl: `https://picsum.photos/200/300?random=${Math.floor(Math.random() * 1000)}` };
    case 'audio':
      return { audioUrl: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3?random=${Math.floor(Math.random() * 1000)}` };
    case 'video':
      return { videoUrl: `https://www.w3schools.com/html/mov_bbb.mp4?random=${Math.floor(Math.random() * 1000)}` };
    case 'file':
      return { fileUrl: `https://example.com/file${Math.floor(Math.random() * 1000)}.pdf`, fileName: `file${Math.floor(Math.random() * 1000)}.pdf` };
    case 'location':
      return { location: { lat: 21.0285 + Math.random() * 0.1, lng: 105.8542 + Math.random() * 0.1 } };
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
      return '';
  }
};

const getRandomDirection = () => {
  const direction = Object.values(SenderType);
  return direction[getRandomFromZeroToN(direction.length + 1)];
};

const generateRandomMessage = (): Message => {
  const messageType = getRandomMessageType();
  const senderType = [SenderType.Contact, SenderType.User][Math.floor(Math.random() * 2)];

  return {
    id: generateRandomId(),
    chatbotId: generateRandomId(),
    conversationId: generateRandomId(),
    messageType: messageType as MessageType,
    content: getRandomContent(messageType),
    senderType: senderType!,
    senderId: `${Math.random()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isLoading: false,
    user: {
      id: generateRandomId(),
      firstName: ['Kha', 'An', 'Hien', 'Minh', 'Linh', 'Trang'][Math.floor(Math.random() * 6)],
      lastName: ['Duy', 'Viet', 'Hieu', 'Thao', 'Phong'][Math.floor(Math.random() * 5)],
      phoneNumber: '095472823940',
      avatar: `https://randomuser.me/api/portraits/men/${senderType === SenderType.Contact ? 1 : 0}.jpg`
    }
  };
};

export const generateMessages = (count: number): Message[] => {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push(generateRandomMessage());
  }
  return messages;
};
