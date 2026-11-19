import {
  type ContactInfoCaptureRecordResult,
  contactInfoCaptureRecordResults,
  contactInfoCaptureSearchOutcomes,
  contactInfoCaptureService,
} from "@chatbotx.io/business"
import {
  buildContactInfoCaptureJob,
  CONTACT_INFO_CAPTURE_RECIPIENT_WAIT_MS,
  type ContactInfoCaptureJobData,
  type ContactInfoCaptureJobSource,
  type ContactInfoCaptureSearchCursor,
  contactInfoCaptureQueue,
} from "@chatbotx.io/worker-config"
import z from "zod"
import { logger } from "../../lib/logger"

type CaptureData = ContactInfoCaptureJobData["data"]

const searchStep = (cursor: ContactInfoCaptureSearchCursor): string =>
  `s${cursor.run}`

const waitStep = (waits: number): string => `w${waits}`

const enqueue = async (
  data: CaptureData,
  step: string,
  delayMs?: number,
): Promise<void> => {
  const job = buildContactInfoCaptureJob(data, step, delayMs)
  await contactInfoCaptureQueue.add(job.name, job.data, job.opts)
}

/**
 * Re-checks the recipient after the next delay of the schedule, or gives up
 * once it is spent. The broadcast may simply not have marked the recipient
 * delivered yet (WhatsApp waits for a receipt), so this is a wait, not a failure.
 */
const waitForRecipient = async (
  data: CaptureData,
  source: ContactInfoCaptureJobSource,
): Promise<void> => {
  const waits = data.recipientWaits ?? 0
  const delayMs = CONTACT_INFO_CAPTURE_RECIPIENT_WAIT_MS[waits]
  if (delayMs === undefined) {
    logger.info(
      { messageId: data.messageId, workspaceId: data.workspaceId, waits },
      "contact-info-capture: recipient never became delivered; dropped",
    )
    return
  }

  await enqueue(
    { ...data, cursor: undefined, recipientWaits: waits + 1, source },
    waitStep(waits + 1),
    delayMs,
  )
}

/** What the job does after a `record` attempt. */
const recordNextSteps = z.enum(["done", "wait"])
type RecordNextStep = z.infer<typeof recordNextSteps>

const recordOutcomes: Record<ContactInfoCaptureRecordResult, RecordNextStep> = {
  [contactInfoCaptureRecordResults.enum.recorded]: recordNextSteps.enum.done,
  [contactInfoCaptureRecordResults.enum.alreadyRecorded]:
    recordNextSteps.enum.done,
  [contactInfoCaptureRecordResults.enum.workspaceUnavailable]:
    recordNextSteps.enum.done,
  [contactInfoCaptureRecordResults.enum.sourceNotAttributable]:
    recordNextSteps.enum.done,
  [contactInfoCaptureRecordResults.enum.recipientFailed]:
    recordNextSteps.enum.done,
  [contactInfoCaptureRecordResults.enum.recipientPending]:
    recordNextSteps.enum.wait,
}

const record = async (
  data: CaptureData,
  source: ContactInfoCaptureJobSource,
  capturedAt: Date,
): Promise<void> => {
  const result = await contactInfoCaptureService.record({
    capturedAt,
    contactId: data.contactId,
    contactInboxId: data.contactInboxId,
    conversationId: data.conversationId,
    followedFlowId: source.followedFlowId,
    inboxId: data.inboxId,
    infoTypes: data.infoTypes,
    sourceId: source.sourceId,
    sourceType: source.sourceType,
    workspaceId: data.workspaceId,
  })
  if (recordOutcomes[result] === recordNextSteps.enum.wait) {
    await waitForRecipient(data, source)
  }
}

/**
 * One run of a capture: either one page of the history search (which may end
 * the job, hand over to the next run, or attribute the message) or, once
 * attributed, the recipient check and insert. A run that has nothing more to do
 * simply returns. A read failure throws, so BullMQ retries the run rather than
 * deciding on partial history.
 *
 * Idempotent: the next run's job id is derived from the message and the step,
 * so a retried or duplicated run enqueues the same id (dropped while retained),
 * and the insert is `ON CONFLICT DO NOTHING`.
 */
export async function processContactInfoCapture(
  data: CaptureData,
): Promise<void> {
  const messageCreatedAt = new Date(data.messageCreatedAt)
  if (Number.isNaN(messageCreatedAt.getTime())) {
    // A poison payload would only fail the same way on every attempt.
    logger.warn(
      { messageId: data.messageId, workspaceId: data.workspaceId },
      "contact-info-capture: invalid message timestamp; dropped",
    )
    return
  }

  if (data.source) {
    await record(data, data.source, messageCreatedAt)
    return
  }

  const conversationCreatedAt = data.conversationCreatedAt
    ? new Date(data.conversationCreatedAt)
    : undefined
  const result = await contactInfoCaptureService.findAttribution({
    conversationCreatedAt:
      conversationCreatedAt && !Number.isNaN(conversationCreatedAt.getTime())
        ? conversationCreatedAt
        : undefined,
    conversationId: data.conversationId,
    cursor: data.cursor,
    inboundMessage: { createdAt: messageCreatedAt, id: data.messageId },
    workspaceId: data.workspaceId,
  })

  switch (result.outcome) {
    case contactInfoCaptureSearchOutcomes.enum.none: {
      logger.debug(
        { messageId: data.messageId, reason: result.reason },
        "contact-info-capture: no source to attribute to",
      )
      return
    }
    case contactInfoCaptureSearchOutcomes.enum.continue: {
      await enqueue(
        { ...data, cursor: result.cursor },
        searchStep(result.cursor),
      )
      return
    }
    case contactInfoCaptureSearchOutcomes.enum.attributed: {
      await record(
        data,
        {
          followedFlowId: result.followedFlowId,
          sourceId: result.sourceId,
          sourceType: result.sourceType,
        },
        messageCreatedAt,
      )
      return
    }
    default: {
      const _exhaustive: never = result
      logger.warn({ result: _exhaustive }, "contact-info-capture: unhandled")
    }
  }
}
