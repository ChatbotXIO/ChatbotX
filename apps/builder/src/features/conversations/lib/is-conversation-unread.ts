import { isAfter } from "date-fns"
import type { ListConversationItemResource } from "../schema/resource"

export const isConversationUnread = (
  conversation: Pick<
    ListConversationItemResource,
    "lastActivityAt" | "agentLastReadAt"
  >,
): boolean =>
  conversation.lastActivityAt !== null &&
  (conversation.agentLastReadAt === null ||
    isAfter(conversation.lastActivityAt, conversation.agentLastReadAt))
