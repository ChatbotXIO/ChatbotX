import * as React from "react";
import Messages from "@/features/inbox/messages";

import { Message } from "@/features/inbox/interfaces/message";
import { generateMessages } from "@/mock/messages.mock";

export default async function InboxMessageSlot() {
  const messages: Message[] = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(generateMessages(200) as Message[]);
    }, 1000);
  });

  return <Messages messages={messages} />
}
