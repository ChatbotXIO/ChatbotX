import { conversationService } from "@chatbotx.io/business"
import type { ActionExecutionContext } from "../../types"
import { resolveActionContactInbox } from "../resolve-action-contact-inbox"
import type { TriggerActionScope } from "./types"

type ScopeIdentity = Pick<
  ActionExecutionContext,
  "contactId" | "workspaceId" | "contactInboxId"
>

/** Memoizes a lookup, but forgets a failure so the next action retries it. */
function memoize<T>(load: () => Promise<T>): {
  get: () => Promise<T>
  reset: () => void
} {
  let cached: Promise<T> | null = null
  return {
    get: () => {
      cached ??= load().catch((error: unknown) => {
        cached = null
        throw error
      })
      return cached
    },
    reset: () => {
      cached = null
    },
  }
}

export function createTriggerActionScope(
  identity: ScopeIdentity,
): TriggerActionScope {
  const { contactId, workspaceId, contactInboxId } = identity
  const conversation = memoize(() =>
    conversationService.findLatestCreatedByContact({ workspaceId, contactId }),
  )
  const contactInbox = memoize(() =>
    resolveActionContactInbox({ contactId, workspaceId, contactInboxId }),
  )

  return {
    getConversation: conversation.get,
    getContactInbox: contactInbox.get,
    invalidateConversation: conversation.reset,
  }
}
