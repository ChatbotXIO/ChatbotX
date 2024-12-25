'use client'

import { Suspense, lazy } from "react";
import { Virtuoso } from "react-virtuoso";
import { Conversation } from "@/features/inbox/interfaces/conversation";

import ConversationLoading from "@/features/inbox/conversation-loading";

const LazyConversationItem = lazy(() => import("@/features/inbox/conversation-item"))

interface ConversationListProps {
  conversations: Conversation[]
}

export default function ConversationList({ conversations }: ConversationListProps) {
  return (
    <Virtuoso
      data={conversations}
      itemContent={(_, item) => (
        <div className="p-2">
          <Suspense fallback={<ConversationLoading/>}>
            <LazyConversationItem conversation={item}/>
          </Suspense>
        </div>
      )}
    />
  )
}
