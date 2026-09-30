import {
  type RequestThreadControlActionInput,
  type ThreadControlSnapshot,
  ThreadControlUnsupportedError,
  threadControlService,
} from "@chatbotx.io/business"
import type { ThreadControlAction } from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { type ThreadControlRole, threadControlRoles } from "@chatbotx.io/sdk"
import { resolveIntegrationContextFromContactInbox } from "./registry"

export type RequestThreadControlActionProps = Omit<
  RequestThreadControlActionInput,
  "applyOnChannel" | "ownerRole"
> & {
  /** Optional `pass` target; omitted means the channel's default (escalation). */
  targetRole?: ThreadControlRole
}

const runOnChannel = async (
  workspaceId: string,
  contactInbox: ContactInboxModel,
  targetRole: ThreadControlRole | undefined,
  action: ThreadControlAction,
): Promise<void> => {
  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId,
    contactInbox,
  })
  if (!integration.hasChannelHandler("conversation", "updateThreadControl")) {
    throw new ThreadControlUnsupportedError(contactInbox.channel)
  }
  await integration.runChannelHandler("conversation", "updateThreadControl", {
    ctx,
    data: { contact: contactInbox, action, targetRole },
  })
}

/**
 * The owner role after our own successful action, so the UI can name it:
 * - `take`: only the escalation partner may take (Meta error `2494191`
 *   otherwise), so after a take we ARE escalation — which also hides Pass,
 *   since escalation cannot pass to itself;
 * - `pass`: the target (Meta's default is the escalation partner);
 * - `release`: the thread is idle and has no owner.
 */
const OWNER_ROLE_AFTER_ACTION: Record<
  ThreadControlAction,
  (targetRole?: ThreadControlRole) => ThreadControlRole | undefined
> = {
  take: () => threadControlRoles.enum.escalation,
  pass: (targetRole) => targetRole ?? threadControlRoles.enum.escalation,
  release: () => undefined,
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
    ownerRole: OWNER_ROLE_AFTER_ACTION[input.action](targetRole),
    applyOnChannel: (contactInbox) =>
      runOnChannel(input.workspaceId, contactInbox, targetRole, input.action),
  })
}
