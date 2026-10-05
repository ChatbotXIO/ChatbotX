import {
  contactInboxService,
  type RequestThreadControlActionInput,
  type SyncThreadOwnerInput,
  type ThreadControlChannelResult,
  type ThreadControlSnapshot,
  ThreadControlUnsupportedError,
  threadControlService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import type { ThreadControlAction } from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type {
  BulkThreadControlAction,
  BulkThreadControlLimits,
  BulkThreadControlResult,
  OutgoingContact,
  ThreadControlRole,
  ThreadOwnerResult,
} from "@chatbotx.io/sdk"
import {
  type ContactInboxRoute,
  resolveIntegrationContextFromContactInbox,
} from "./registry"

export type RequestThreadControlActionProps = Omit<
  RequestThreadControlActionInput,
  "applyOnChannel"
> & {
  /** Optional `pass` target; omitted means the channel's default (escalation). */
  targetRole?: ThreadControlRole
}

const runOnChannel = async (
  workspaceId: string,
  contactInbox: ContactInboxModel,
  targetRole: ThreadControlRole | undefined,
  action: ThreadControlAction,
): Promise<ThreadControlChannelResult> => {
  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId,
    contactInbox,
  })
  if (!integration.hasChannelHandler("conversation", "updateThreadControl")) {
    throw new ThreadControlUnsupportedError(contactInbox.channel)
  }
  // The channel reports who owns the thread after the action: a take makes a
  // WhatsApp partner the escalation role, another channel names its own owner.
  return await integration.runChannelHandler(
    "conversation",
    "updateThreadControl",
    {
      ctx,
      data: { contact: contactInbox, action, targetRole },
    },
  )
}

/**
 * Take, release or pass a routing thread on the contact's channel, then record
 * the outcome (`threadControlService.requestAction`). It lives here, not in
 * `packages/business`, because resolving the channel integration needs the
 * registry, which itself depends on business.
 *
 * Throws `ThreadControlUnsupportedError` when the channel has no
 * `updateThreadControl` handler, and rethrows the channel's `ChannelError`
 * unchanged (callers map it: a toast in the builder, the `error` state in a
 * flow). Neither changes the stored state.
 */
export function requestThreadControlAction(
  props: RequestThreadControlActionProps,
): Promise<ThreadControlSnapshot> {
  const { targetRole, ...input } = props
  return threadControlService.requestAction({
    ...input,
    applyOnChannel: (contactInbox) =>
      runOnChannel(input.workspaceId, contactInbox, targetRole, input.action),
  })
}

/** The conversation whose contact owns the contact inbox being steered. */
export type ThreadControlConversation = { id: string; contactId: string }

const CONTACT_INBOX_NOT_FOUND = "Contact inbox not found for this conversation"

/**
 * `requestThreadControlAction` for a contact inbox of a conversation: refuses
 * a contact inbox that is not one of the conversation's contact, so a caller
 * cannot steer a thread of another contact. Callers (the inbox UI, the public
 * API) resolve and authorize the conversation themselves.
 *
 * Throws a 404 `notFound` exception for a foreign contact inbox.
 */
export async function requestConversationThreadControl(
  props: Omit<RequestThreadControlActionProps, "conversationId"> & {
    conversation: ThreadControlConversation
  },
): Promise<ThreadControlSnapshot> {
  const { conversation, ...request } = props
  const contactInboxes = await contactInboxService.listByContactId({
    workspaceId: request.workspaceId,
    contactId: conversation.contactId,
  })
  if (!contactInboxes.some((row) => row.id === request.contactInboxId)) {
    throw notFoundException(CONTACT_INBOX_NOT_FOUND)
  }
  return await requestThreadControlAction({
    ...request,
    conversationId: conversation.id,
  })
}

/**
 * On-demand owner check for a contact inbox of a conversation: reads a fresh
 * (uncached) row of the conversation's own contact — the sync reconciles
 * against the stored state — and runs `syncThreadOwner`. Throws a 404
 * `notFound` exception for a foreign contact inbox.
 */
export async function syncConversationThreadOwner(props: {
  workspaceId: string
  conversation: ThreadControlConversation
  contactInboxId: string
}): Promise<ThreadControlSnapshot> {
  const contactInbox = await contactInboxService.findByUncached({
    where: {
      id: props.contactInboxId,
      contactId: props.conversation.contactId,
    },
  })
  if (!contactInbox) {
    throw notFoundException(CONTACT_INBOX_NOT_FOUND)
  }
  return await syncThreadOwner({
    workspaceId: props.workspaceId,
    contactInbox,
    conversationId: props.conversation.id,
  })
}

/**
 * Asks the contact's channel who owns the thread. `null` when the channel has
 * no `getThreadOwner` handler: "cannot sync", never "no owner".
 */
export async function getChannelThreadOwner(props: {
  workspaceId: string
  contactInbox: ContactInboxModel
}): Promise<ThreadOwnerResult | null> {
  const { integration, ctx } =
    await resolveIntegrationContextFromContactInbox(props)
  if (!integration.hasChannelHandler("conversation", "getThreadOwner")) {
    return null
  }
  return await integration.runChannelHandler("conversation", "getThreadOwner", {
    ctx,
    data: { contact: props.contactInbox },
  })
}

export type SyncThreadOwnerProps = Omit<SyncThreadOwnerInput, "fetchOwner">

/**
 * Reconciles the stored owner with the channel's answer
 * (`threadControlService.syncThreadOwner`). The caller — which resolved the
 * channel's own and business-ai app ids on the channel side — passes them as
 * plain params; this wrapper only supplies the channel fetch. Lives here for
 * the same reason as `requestThreadControlAction`.
 */
export function syncThreadOwner(
  props: SyncThreadOwnerProps,
): Promise<ThreadControlSnapshot> {
  return threadControlService.syncThreadOwner({
    ...props,
    fetchOwner: (contactInbox) =>
      getChannelThreadOwner({
        workspaceId: props.workspaceId,
        contactInbox,
      }),
  })
}

export type BulkThreadControlRunner = (input: {
  action: BulkThreadControlAction
  contacts: OutgoingContact[]
  text?: string
}) => Promise<BulkThreadControlResult>

/** A channel's bulk thread-control call and the limits it must be driven within. */
export type BulkThreadControl = {
  run: BulkThreadControlRunner
  limits: BulkThreadControlLimits
}

/**
 * Resolves the channel integration of an inbox ONCE and returns the function
 * that hands a batch of its threads to the AI agent or takes them back, with
 * the limits the channel advertises for it (batch size, pacing). The caller
 * runs it for every batch of a Page, so the integration lookup is not repeated
 * per batch.
 *
 * Per-thread failures come back in the results; a failure of the whole call
 * (revoked token) rethrows the channel's `ChannelError`. Throws
 * `ThreadControlUnsupportedError` when the channel has no bulk handler. The
 * outcome is NOT recorded here: the caller settles each thread
 * (`threadControlService.recordEvent`) because it owns the cut-off times.
 */
export async function createBulkThreadControl(props: {
  workspaceId: string
  inbox: ContactInboxRoute
}): Promise<BulkThreadControl> {
  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: props.workspaceId,
    contactInbox: props.inbox,
  })
  if (
    !(
      integration.hasChannelHandler(
        "conversation",
        "bulkUpdateThreadControl",
      ) &&
      integration.hasChannelHandler("conversation", "bulkThreadControlLimits")
    )
  ) {
    throw new ThreadControlUnsupportedError(props.inbox.channel)
  }
  const limits = await integration.runChannelHandler(
    "conversation",
    "bulkThreadControlLimits",
    { ctx },
  )
  return {
    limits,
    run: (input) =>
      integration.runChannelHandler("conversation", "bulkUpdateThreadControl", {
        ctx,
        data: input,
      }),
  }
}
