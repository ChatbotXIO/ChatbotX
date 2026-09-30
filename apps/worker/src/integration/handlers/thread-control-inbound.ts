import { threadControlService } from "@chatbotx.io/business"
import { THREAD_CONTROL_TIMESTAMP_RESOLUTION_MS } from "@chatbotx.io/database/partials"
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
   * The owner delivery of a message first stored from its standby copy. The
   * standby copy was recorded at the same Meta second and `standbyReceived`
   * outranks `inboundReceived` on a tie, so the owner copy is recorded one
   * timestamp tick later: it is the later, authoritative delivery of that
   * message. Any Meta event from a later second still wins over it.
   */
  supersedesStandbyCopy?: boolean
}): Promise<void> {
  const { inbox, contactInbox, conversationId, threadControl } = props
  const deliveredAt = threadControl.occurredAt ?? props.fallbackOccurredAt
  const occurredAt = props.supersedesStandbyCopy
    ? new Date(deliveredAt.getTime() + THREAD_CONTROL_TIMESTAMP_RESOLUTION_MS)
    : deliveredAt
  try {
    await threadControlService.recordInboundDelivery({
      workspaceId: inbox.workspaceId,
      inbox,
      contactInbox,
      conversationId,
      delivery: threadControl.delivery,
      context: threadControl.context,
      occurredAt,
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
