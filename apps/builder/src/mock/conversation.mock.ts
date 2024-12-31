import { Conversation } from "@/features/inbox/interfaces/conversation";
import { generateRandomId } from './common.mock'

export const generateRandomConversation = (): Conversation => {
  const randomChannelTypes = ['Messenger', 'WhatsApp', 'Slack', 'Email'];
  const randomAssignedTypes = ['Team', 'Individual'];
  const randomAssignedNames = ['team 1', 'team 2', 'team 3', 'team 4'];
  const randomMessages = [
    'Tôi có nhu cầu cần tư vấn sản phẩm về một số vấn đề.',
    'Hiện tại tôi gặp một số khó khăn, bạn có thể giúp tôi không?',
    'Tôi cần bạn hỗ trợ về sản phẩm, có thể tư vấn được không?',
    'Xin chào, tôi muốn tìm hiểu thêm về sản phẩm của bạn.',
    'Tôi cần hỗ trợ, sản phẩm của tôi đang gặp sự cố.'
  ];

  return {
    id: generateRandomId(),
    contactId: generateRandomId(),
    channelType: randomChannelTypes[Math.floor(Math.random() * randomChannelTypes.length)] as string,
    lastActivityAt: new Date().toISOString(),
    contactLastSeenAt: new Date().toISOString(),
    lastMessage: randomMessages[Math.floor(Math.random() * randomMessages.length)] as string,
    assignedType: randomAssignedTypes[Math.floor(Math.random() * randomAssignedTypes.length)] as string,
    assignedId: generateRandomId(),
    contact: {
      id: generateRandomId(),
      firstName: ['Kha', 'An', 'Hien', 'Minh', 'Linh', 'Trang'][Math.floor(Math.random() * 6)] as string,
      lastName: ['Duy', 'Viet', 'Hieu', 'Thao', 'Phong'][Math.floor(Math.random() * 5)] as string,
      phoneNumber: '',
      avatar: `https://randomuser.me/api/portraits/men/${Math.floor(Math.random() * 99)}.jpg`
    },
    assignedTeam: {
      id: generateRandomId(),
      name: randomAssignedNames[Math.floor(Math.random() * randomAssignedNames.length)] as string
    }
  };
};

export const generateConversations = (count: number): Conversation[] => {
  const conversations: Conversation[] = [];
  for (let i = 0; i < count; i++) {
    conversations.push(generateRandomConversation());
  }
  return conversations;
};
