import {
  applyInboundWebhookPayload,
  contactInboxService,
  inboundWebhookService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  sanitizePublicText,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { toLoggableDatabaseError } from "@chatbotx.io/database/client"
import {
  INBOUND_WEBHOOK_LIMITS,
  INBOUND_WEBHOOK_REQUEST_ERROR_CODE,
  type InboundWebhookActionResult,
  type InboundWebhookFieldError,
  inboundWebhookActionTypes,
} from "@chatbotx.io/database/partials"
import type {
  InboundWebhookModel,
  InboundWebhookRequestModel,
} from "@chatbotx.io/database/types"
import type { JobProcessInboundWebhookRequest } from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { isFinalAttempt } from "../../lib/job-attempts"
import { logger } from "../../lib/logger"
import { ActionExecutor } from "../../trigger/services/action-executor"

const PROCESSING_FAILED_MESSAGE = "The request could not be processed"
const ACTION_FAILED_MESSAGE = "The action failed"
// Claims (job retries plus re-dispatches) after which an infrastructure error
// stops being treated as transient. About 20 minutes of the 5-minute cron.
const MAX_CLAIMS_FOR_TRANSIENT_ERRORS = 10

type ClaimedRequest = {
  request: InboundWebhookRequestModel
  claimToken: string
}

const SERVER_ERROR_STATUS = 500

const isBusinessError = (error: unknown): boolean =>
  error instanceof ChatbotXException &&
  error.httpStatusCode < SERVER_ERROR_STATUS

const orNull = <T>(items: T[]): T[] | null => (items.length > 0 ? items : null)

const shortMessage = (error: unknown, fallback: string): string =>
  sanitizePublicText(toPublicErrorMessage(error, fallback), {
    maxLength: INBOUND_WEBHOOK_LIMITS.maxErrorMessageLength,
  })

const executeAction = async (input: {
  executor: ActionExecutor
  webhook: InboundWebhookModel
  request: InboundWebhookRequestModel
  contactId: string
  contactInboxId: string
  index: number
}): Promise<InboundWebhookActionResult> => {
  const { executor, webhook, request, contactId, contactInboxId, index } = input
  const action = webhook.actions[index]
  const type = String(action?.type)
  if (!(action && inboundWebhookActionTypes.safeParse(action.type).success)) {
    return { index, type, status: "skipped", reason: "unsupportedAction" }
  }
  try {
    const outcome = await executor.execute({
      action,
      contactId,
      contactInboxId,
      workspaceId: webhook.workspaceId,
      source: { kind: "inboundWebhook", inboundWebhookId: webhook.id },
      // Stable across retries of this request, different per action.
      occurrenceKey: `inboundWebhook:${request.id}:${index}`,
    })
    return outcome.status === "succeeded"
      ? { index, type, status: "succeeded" }
      : { index, type, status: "skipped", reason: outcome.reason }
  } catch (error) {
    logger.error(
      {
        err: toLoggableDatabaseError(error),
        requestId: request.id,
        index,
        type,
      },
      "Inbound webhook action failed",
    )
    return {
      index,
      type,
      status: "failed",
      error: shortMessage(error, ACTION_FAILED_MESSAGE),
    }
  }
}

/**
 * Runs the actions not yet recorded, checkpointing after each one so a
 * reclaimed request resumes instead of repeating them. `null` means the claim
 * was lost (another worker owns the request now): stop without writing.
 */
const runActions = async (input: {
  claimed: ClaimedRequest
  webhook: InboundWebhookModel
  contactId: string
  contactInboxId: string
}): Promise<InboundWebhookActionResult[] | null> => {
  const { claimed, webhook, contactId, contactInboxId } = input
  const { request, claimToken } = claimed
  // The owner may have edited the actions since an earlier attempt: a result
  // only counts for the action still at that position, never a different one.
  const results = (request.actionResults ?? []).filter(
    ({ index, type }) => webhook.actions[index]?.type === type,
  )
  const done = new Set(results.map(({ index }) => index))
  const executor = new ActionExecutor()

  for (const index of webhook.actions.keys()) {
    if (done.has(index)) {
      continue
    }
    results.push(
      await executeAction({
        executor,
        webhook,
        request,
        contactId,
        contactInboxId,
        index,
      }),
    )
    const owned = await inboundWebhookService.checkpointRequest({
      id: request.id,
      claimToken,
      progress: { actionResults: results },
    })
    if (!owned) {
      return null
    }
  }
  return results
}

type AppliedTarget = {
  inboxId: string
  contactId: string
  contactInboxId: string
  fieldErrors: InboundWebhookFieldError[]
}

/**
 * What a previous attempt already applied, when it got as far as recording it.
 * Re-applying would overwrite fields that finished actions (or the flow they
 * started) have changed since, so a retry or reclaim resumes from the stored
 * target instead. `null` when nothing was recorded, or the contact lost its
 * connection to the inbox meanwhile — then the payload is applied again.
 */
const findAppliedTarget = async (
  request: InboundWebhookRequestModel,
): Promise<AppliedTarget | null> => {
  const { contactId, contactInboxId, inboxId, actionResults } = request
  if (!(contactId && contactInboxId && inboxId && actionResults)) {
    return null
  }
  // The exact connection the first attempt used, if it is still the contact's.
  const contactInbox = await contactInboxService.findByIdForContact({
    id: contactInboxId,
    contactId,
    workspaceId: request.workspaceId,
  })
  return contactInbox
    ? {
        inboxId,
        contactId,
        contactInboxId,
        fieldErrors: request.fieldErrors ?? [],
      }
    : null
}

/**
 * Applies the payload and records the target. Safe to repeat: it only looks up
 * and upserts. `null` ends the attempt — the request was closed as skipped, or
 * the claim was lost.
 */
const applyAndRecord = async (input: {
  claimed: ClaimedRequest
  webhook: InboundWebhookModel
}): Promise<AppliedTarget | null> => {
  const { claimed, webhook } = input
  const { request, claimToken } = claimed
  const applied = await applyInboundWebhookPayload({
    webhook,
    payload: request.payload,
  })
  if (applied.status === "skipped") {
    await inboundWebhookService.completeRequest({
      id: request.id,
      claimToken,
      completion: {
        status: "skipped",
        skipReason: applied.reason,
        inboxId: applied.inboxId ?? null,
        fieldErrors: orNull(applied.fieldErrors),
      },
    })
    return null
  }
  const owned = await inboundWebhookService.checkpointRequest({
    id: request.id,
    claimToken,
    progress: {
      inboxId: applied.inboxId,
      contactId: applied.contactId,
      contactInboxId: applied.contactInboxId,
      fieldErrors: orNull(applied.fieldErrors),
      actionResults: request.actionResults ?? [],
    },
  })
  return owned ? applied : null
}

const processClaimedRequest = async (claimed: ClaimedRequest) => {
  const { request, claimToken } = claimed
  const complete = (
    completion: Parameters<
      typeof inboundWebhookService.completeRequest
    >[0]["completion"],
  ) =>
    inboundWebhookService.completeRequest({
      id: request.id,
      claimToken,
      completion,
    })

  const webhook = await inboundWebhookService.findOrFail({
    workspaceId: request.workspaceId,
    id: request.inboundWebhookId,
  })
  if (!webhook.active) {
    await complete({ status: "skipped", skipReason: "webhookInactive" })
    return
  }

  const resumed = await findAppliedTarget(request)
  const applied = resumed ?? (await applyAndRecord({ claimed, webhook }))
  if (!applied) {
    return
  }
  const { fieldErrors } = applied

  const actionResults = await runActions({
    claimed,
    webhook,
    contactId: applied.contactId,
    contactInboxId: applied.contactInboxId,
  })
  if (!actionResults) {
    return
  }

  const hasProblem =
    fieldErrors.length > 0 ||
    actionResults.some(({ status }) => status !== "succeeded")
  await complete({
    status: hasProblem ? "completedWithErrors" : "processed",
    inboxId: applied.inboxId,
    contactId: applied.contactId,
    contactInboxId: applied.contactInboxId,
    fieldErrors: orNull(fieldErrors),
    actionResults: orNull(actionResults),
  })
}

/**
 * What a failed attempt leaves behind: a retry gives the request back; the last
 * attempt closes it as `failed` so it never sits pending. Both are fenced by
 * the claim token, so a worker that lost its claim cannot touch the row.
 */
const settleFailedAttempt = async (input: {
  claimed: ClaimedRequest
  error: unknown
  job: Job
}) => {
  const { claimed, error, job } = input
  const { request, claimToken } = claimed
  try {
    // A business error (4xx: quota, validation) fails again, so the request
    // closes as failed. An infrastructure error (a database restart, a lock
    // timeout) usually passes: the row goes back to `received` and the
    // re-dispatch cron retries it, so a delivery answered 202 is not lost to a
    // short outage — until its claim budget runs out.
    const willNotRecover =
      isBusinessError(error) ||
      request.attempts >= MAX_CLAIMS_FOR_TRANSIENT_ERRORS
    if (isFinalAttempt(job) && willNotRecover) {
      await inboundWebhookService.completeRequest({
        id: request.id,
        claimToken,
        completion: {
          status: "failed",
          errorCode:
            error instanceof ChatbotXException
              ? error.code
              : INBOUND_WEBHOOK_REQUEST_ERROR_CODE.systemError,
          errorMessage: shortMessage(error, PROCESSING_FAILED_MESSAGE),
        },
      })
      return
    }
    await inboundWebhookService.releaseRequest({
      id: request.id,
      claimToken,
    })
  } catch (settleError) {
    logger.error(
      { err: toLoggableDatabaseError(settleError), requestId: request.id },
      "Could not settle a failed inbound webhook attempt",
    )
  }
}

/**
 * Processes one stored inbound-webhook request. The claim is exclusive and
 * leased, every write after it is fenced, and each action is checkpointed, so
 * duplicate and retried jobs, crashed workers and reclaims neither double-apply
 * nor lose work. Infrastructure failures are rethrown so BullMQ retries them.
 */
export async function processInboundWebhookRequest(
  data: JobProcessInboundWebhookRequest["data"],
  job: Job,
): Promise<void> {
  const claimed = await inboundWebhookService
    .claimRequest(data.requestId)
    .catch((error: unknown) => {
      throw toLoggableDatabaseError(error)
    })
  if (!claimed) {
    return
  }
  try {
    await processClaimedRequest(claimed)
  } catch (error) {
    logger.error(
      { err: toLoggableDatabaseError(error), requestId: data.requestId },
      "Inbound webhook request failed",
    )
    await settleFailedAttempt({ claimed, error, job })
    throw toLoggableDatabaseError(error)
  }
}

/**
 * The owner is blocked, so the request is never processed. Closing it as
 * skipped takes it out of the re-dispatch scan: otherwise the oldest pending
 * rows of blocked workspaces would fill every scan and starve other
 * workspaces' genuinely lost requests (AGENTS.md invariant 15).
 */
export async function skipBlockedInboundWebhookRequest(
  data: JobProcessInboundWebhookRequest["data"],
): Promise<void> {
  const claimed = await inboundWebhookService.claimRequest(data.requestId)
  if (!claimed) {
    return
  }
  await inboundWebhookService.completeRequest({
    id: claimed.request.id,
    claimToken: claimed.claimToken,
    completion: { status: "skipped", skipReason: "workspaceBlocked" },
  })
}
