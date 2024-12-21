"use client"

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area"
import InboxConversationItem from "@/features/inbox/conversation-item";

export default function InboxConversationSlot() {
  const user = {
    avatarUrl: "https://randomuser.me/api/portraits/men/75.jpg",
    username: "John Doe",
    isOnline: true,
    lastMessageTime: Date.now() - 3600000, // 1 giờ trước
    lastMessage: "Xin chào, tôi muốn hỏi về sản phẩm của bạn!"
  };

  return (
    <ScrollArea>
      <InboxConversationItem { ...user } />
      <InboxConversationItem { ...user } />
    </ScrollArea>
  )
}
