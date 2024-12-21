import { Suspense } from "react";

import { Conversation } from "@/features/inbox/interfaces/conversation";

import { ScrollArea } from "@/components/ui/scroll-area"
import ConversationItem from "@/features/inbox/conversation-item";
import ConversationLoading from "@/features/inbox/conversation-loading";

const mockData: Conversation[] = [
  {
    id: "zx73b637gpamyvss1xbsa2t8",
    contactId: "kudi17sxupwv9txx8dvh36lv",
    channelType: "Messenger",
    lastActivityAt: "2024-12-18 09:39:35.564",
    contactLastSeenAt: "2024-12-18 09:39:35.564",
    lastMessage: "hehehe",
    assignedType: "Team",
    assignedId: "q6q2qjzuz6yvkg6uklhg8cyl",
    contact: {
      id: "kudi17sxupwv9txx8dvh36lv",
      firstName: "Kha",
      lastName: "Duy",
      phoneNumber: null,
      avatar: "https://cdnj1.com/assets/1862052/c/7826524027423535.jpg"
    },
    assignedTeam: {
      id: "q6q2qjzuz6yvkg6uklhg8cyl",
      name: "team 1"
    }
  },
  {
    id: "ek4t8rgoafgvm1wm648f8cd8",
    contactId: "tafdivntf7wleaz8c99k0rdd",
    channelType: "Sms",
    lastActivityAt: "2024-12-18 09:39:35.564",
    contactLastSeenAt: "2024-12-18 09:39:35.564",
    lastMessage: "huhuhu",
    assignedType: "User",
    assignedId: "o7pkox67mfuf0k4gr4wxg0on",
    contact: {
      id: "tafdivntf7wleaz8c99k0rdd",
      firstName: null,
      lastName: null,
      phoneNumber: "+84905849356",
      avatar: null
    },
    assignedUser: {
      id: "o7pkox67mfuf0k4gr4wxg0on",
      name: "user 1"
    }
  },
  {
    id: "ahg3s6oqiqskxb3x7wk7fiqk",
    contactId: "bnk06cdfsx7yvzkvpru0abs1",
    channelType: "Whatsapp",
    lastActivityAt: "2024-12-18 09:39:35.564",
    contactLastSeenAt: "2024-12-18 09:39:35.564",
    lastMessage: "hihihi",
    assignedType: null,
    assignedId: null,
    contact: {
      id: "bnk06cdfsx7yvzkvpru0abs1",
      firstName: "Whats",
      lastName: "app",
      phoneNumber: null,
      avatar: "https://cdnj1.com/assets/1862052/c/8156172471162590.jpg"
    }
  }
];

export default async function InboxConversationSlot() {

  const conversations: Conversation[] = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockData);
    }, 1000);
  });

  return (
    <ScrollArea>
      {
        conversations.map((item: Conversation) => (
          <div className="p-2" key={item.id}>
            <Suspense fallback={<ConversationLoading />}>
              <ConversationItem conversation={item} />
            </Suspense>
          </div>
        ))
      }
    </ScrollArea>
  )
}
