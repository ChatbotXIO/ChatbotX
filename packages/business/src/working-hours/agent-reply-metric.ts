import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { conversationService } from "../conversation/service"
import { logger } from "../logger"
import { workspaceService } from "../workspace/service"
import { workingSecondsBetween } from "./duration"
import { resolveMeasuredFrom } from "./measure"
import { workingHoursService } from "./service"
import { resolveWorkingHoursTimezone } from "./timezone"

type ReplySender = { kind: "agent"; userId: string } | { kind: "other" }

/**
 * Closes the conversation's human-reply window once the reply has been
 * enqueued, and for a human agent emits `agent:replied` with the measured
 * seconds (plan D8). Channel-agnostic. Never rejects: the message is already
 * queued, so a failure here is logged (`err`) and the send still succeeds.
 */
export async function recordAgentReply(props: {
  conversationId: string
  workspaceId: string
  contactInbox: Pick<ContactInboxModel, "contactId" | "channel" | "inboxId">
  at: Date
  sender: ReplySender
  eventId: string
}): Promise<void> {
  const { conversationId, workspaceId, contactInbox, at, sender, eventId } =
    props
  try {
    const claim = await conversationService.markAgentReplied({
      id: conversationId,
      workspaceId,
      at,
    })
    if (
      sender.kind !== "agent" ||
      !claim ||
      claim.closedAwaitingSince === null
    ) {
      return
    }

    const measuredFrom = resolveMeasuredFrom({
      closedAwaitingSince: claim.closedAwaitingSince,
      assignedUserId: claim.assignedUserId,
      // `at` is captured before the row exists; an assignment that landed
      // after it must not push the start past the reply instant.
      assignedUserAt:
        claim.assignedUserAt && claim.assignedUserAt <= at
          ? claim.assignedUserAt
          : null,
      adminId: sender.userId,
    })
    const responseSeconds = Math.max(
      0,
      Math.floor((at.getTime() - measuredFrom.getTime()) / 1000),
    )

    const [schedule, workspace] = await Promise.all([
      workingHoursService.findForAgent({ workspaceId, userId: sender.userId }),
      workspaceService.find({ where: { id: workspaceId } }),
    ])
    // Already whole, non-negative seconds.
    const workingResponseSeconds = schedule
      ? workingSecondsBetween({
          from: measuredFrom,
          to: at,
          intervals: schedule.intervals,
          timezone: resolveWorkingHoursTimezone(
            workspace ?? { id: workspaceId },
          ),
          dateOverrides: await workingHoursService.findDateOverridesFor({
            workspaceId,
            workingHoursId: schedule.workingHoursId,
            from: measuredFrom,
            to: at,
          }),
        })
      : null

    // Not awaited (best-effort, off the send path), but an async rejection
    // must be logged rather than become an unhandled rejection.
    Promise.resolve(
      emit("analytics:dashboard", {
        eventType: "agent:replied",
        eventId,
        workspaceId,
        conversationId,
        contactId: contactInbox.contactId,
        adminId: sender.userId,
        occurredAt: at,
        awaitingSince: claim.closedAwaitingSince,
        measuredFrom,
        responseSeconds,
        workingResponseSeconds,
        workingHoursId: schedule?.workingHoursId ?? null,
        slaTargetSeconds: claim.slaTargetSeconds ?? null,
        slaMet: claim.slaDueAt
          ? at.getTime() <= claim.slaDueAt.getTime()
          : null,
        isFirstResponse: claim.isFirstResponse,
        channel: contactInbox.channel,
        inboxId: contactInbox.inboxId,
      }),
    ).catch((err: unknown) => {
      logger.error(
        { err, workspaceId, conversationId, eventId },
        "Failed to emit agent:replied",
      )
    })
  } catch (err) {
    logger.error(
      { err, workspaceId, conversationId, eventId },
      "Failed to record agent reply after enqueue",
    )
  }
}
