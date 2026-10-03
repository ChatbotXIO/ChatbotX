import { threadControlService } from "@chatbotx.io/business"
import type { ContactInboxModel, InboxModel } from "@chatbotx.io/database/types"
import type { ThreadControlReceiveInfo } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"

/**
 * Records the routing effect of one inbound delivery (see
 * `threadControlService.recordInboundDelivery` for the rules). An
 * already-owned thread, or a number that never saw routing traffic, costs no
 * query.
 *
 * A failure is logged and rethrown so the job retries: a lost transition
 * would leave the row saying the wrong responder owns the thread (owner lost
 * → the bot's replies are refused by the send gate; standby lost → the
 * composer and gate stay open while another app answers). The caller records
 * so that the retry can still do it: an owner delivery before the message is
 * saved (and before a standby copy's promotion claim), a standby delivery for
 * any copy still stored as standby and unpromoted.
 */
export async function recordInboundThreadControl(props: {
  inbox: InboxModel
  contactInbox: ContactInboxModel
  conversationId: string
  threadControl: ThreadControlReceiveInfo
  /** Used when the channel gave no timestamp for the delivered item. */
  fallbackOccurredAt: Date
  /**
   * The owner delivery of a message first stored from its standby copy. It is
   * recorded at the standby copy's OWN time (never advanced, so a handover of
   * the same Meta second cannot be leapfrogged) through a dedicated write that
   * applies only while the row is still that standby copy; a handover
   * recorded before it keeps the thread standby, and one recorded after it
   * outranks `inboundReceived`, so a handover wins in either order.
   */
  supersedesStandbyCopy?: boolean
}): Promise<void> {
  const { inbox, contactInbox, conversationId, threadControl } = props
  const deliveredAt = threadControl.occurredAt ?? props.fallbackOccurredAt
  try {
    await threadControlService.recordInboundDelivery({
      workspaceId: inbox.workspaceId,
      inbox,
      contactInbox,
      conversationId,
      delivery: threadControl.delivery,
      context: threadControl.context,
      ...(threadControl.ownerAppId
        ? { ownerAppId: threadControl.ownerAppId }
        : {}),
      ...(threadControl.ownerRole
        ? { ownerRole: threadControl.ownerRole }
        : {}),
      occurredAt: deliveredAt,
      ...(props.supersedesStandbyCopy
        ? { supersedesStandbyAt: deliveredAt }
        : {}),
    })
  } catch (err) {
    logger.error(
      {
        err,
        contactInboxId: contactInbox.id,
        delivery: threadControl.delivery,
      },
      "Unable to record the conversation routing state of an inbound delivery",
    )
    throw err
  }
}
