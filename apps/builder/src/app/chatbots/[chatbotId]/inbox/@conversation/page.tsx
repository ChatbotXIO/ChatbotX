import { Conversation } from "@/features/inbox/interfaces/conversation";
import ConversationList from "@/features/inbox/conversation-list";
import { generateConversations } from "@/mock/conversation.mock";

export default async function InboxConversationSlot() {
  const conversations: Conversation[] = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(generateConversations(200) as Conversation[]);
    }, 1000);
  });

  return <ConversationList conversations={conversations} />
}
