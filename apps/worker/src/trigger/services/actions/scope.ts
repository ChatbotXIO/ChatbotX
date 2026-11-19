import { randomUUID } from "node:crypto"

import { conversationService } from "@chatbotx.io/business"
import { isEmailThreadSourceId } from "@chatbotx.io/utils"
import type { ActionExecutionContext } from "../../types"
import { resolveActionContactInbox } from "../resolve-action-contact-inbox"
import type { TriggerActionScope } from "./types"

type ScopeIdentity = Pick<
  ActionExecutionContext,
  "contactId" | "workspaceId" | "contactInboxId" | "conversationId"
> & {
  /**
   * Stable key of this run (identical on a retry). It seeds the one outreach
   * email thread the run opens; unset, the thread is only stable within the run.
   */
  runKey?: string
}

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
  const { contactId, workspaceId, contactInboxId, conversationId } = identity
  const runKey = identity.runKey ?? `run:${randomUUID()}`
  const contactInbox = memoize(() =>
    resolveActionContactInbox({ contactId, workspaceId, contactInboxId }),
  )
  // An SMTP contact may have no conversation until something is sent: every
  // email thread is its own conversation. A run opens at most one thread, so
  // a tag plus a flow share it and a retry reuses it.
  const outreach = memoize(async () => {
    const inbox = await contactInbox.get()
    if (inbox?.channel !== "smtp") {
      return
    }
    return await conversationService.openEmailThread({
      workspaceId,
      contactId,
      contactInboxId: inbox.id,
      contactInbox: { ...inbox, contactId },
      seed: runKey,
    })
  })
  const conversation = memoize(async () => {
    // Only an email thread is addressed by id; every other channel keeps
    // resolving the contact's latest conversation.
    if (conversationId) {
      const requested = await conversationService.findBy({
        where: { id: conversationId, workspaceId, contactId },
      })
      if (requested && isEmailThreadSourceId(requested.sourceId)) {
        return requested
      }
    }
    const latest = await conversationService.findLatestCreatedByContact({
      workspaceId,
      contactId,
    })
    return latest ?? (await outreach.get())
  })

  return {
    getConversation: conversation.get,
    getOutreachConversation: outreach.get,
    getContactInbox: contactInbox.get,
    invalidateConversation: conversation.reset,
  }
}
