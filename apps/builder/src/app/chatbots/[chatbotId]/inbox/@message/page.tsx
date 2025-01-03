import { Message } from "@/features/inbox/interfaces/message";
import MessageList from "@/features/messages/message-list";
import { generateMessages } from "@/mock/messages.mock";

export default async function InboxMessageListSlot() {
  const messages: Message[] = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(generateMessages(200) as Message[]);
    }, 1000);
  });

  return <MessageList messages={messages} />
}
