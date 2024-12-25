const getRandomFromZeroToN = (n: number) => {
  return Math.floor(Math.random() * (n + 1));
};

const generateRandomId = (): string => {
  return Math.random().toString(36).substring(2, 18);
};

const getRandomMessageType = (): string => {
  const messageTypes: string[] = [
    'text', 'image', 'markdown', 'audio', 'video', 'file', 'location',
    'carousel', 'card', 'dropdown', 'choice', 'bloc'
  ];
  return messageTypes[getRandomFromZeroToN(messageTypes.length)] || 'text';
};

const getRandomContent = (type: string) => {
  switch (type) {
    case 'text':
      return 'Đây là một tin nhắn văn bản ngẫu nhiên.';
    case 'image':
      return 'https://example.com/random-image.jpg';
    case 'markdown':
      return '**Markdown text**';
    case 'audio':
      return 'https://example.com/random-audio.mp3';
    case 'video':
      return 'https://example.com/random-video.mp4';
    case 'file':
      return 'https://example.com/random-file.pdf';
    case 'location':
      return 'Latitude: 12.34, Longitude: 56.78';
    case 'carousel':
      return 'Carousel content here';
    case 'card':
      return 'Card content here';
    case 'dropdown':
      return 'Dropdown content here';
    case 'choice':
      return 'Choice content here';
    case 'bloc':
      return 'Bloc content here';
    default:
      return '';
  }
};

const getRandomDirection = () => {
  const direction = ['sent', 'received'];
  return direction[getRandomFromZeroToN(direction.length)];
};

const generateRandomMessage = () => {
  const messageType = getRandomMessageType();
  return {
    id: generateRandomId(),
    chatbotId: generateRandomId(),
    conversationId: generateRandomId(),
    messageType: messageType,
    content: getRandomContent(messageType),
    direction: getRandomDirection(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const generateMessages = (count: number) => {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push(generateRandomMessage());
  }
  return messages;
};
