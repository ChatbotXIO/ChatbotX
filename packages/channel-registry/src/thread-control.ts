import {
  type RequestThreadControlActionInput,
  type SyncThreadOwnerInput,
  type ThreadControlChannelResult,
  type ThreadControlSnapshot,
  ThreadControlUnsupportedError,
  threadControlService,
} from "@chatbotx.io/business"
import type { ThreadControlAction } from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type { ThreadControlRole, ThreadOwnerResult } from "@chatbotx.io/sdk"
import { resolveIntegrationContextFromContactInbox } from "./registry"

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
