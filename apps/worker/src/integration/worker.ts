import { createHash } from "node:crypto"
import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  conversationService,
  whatsappCallPermissionService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import { emit } from "@chatbotx.io/event-bus"
import { getStoryReply, getWhatsappCallPermissionReply } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  AIJobAction,
  aiAgentQueue,
  type CallTranscriptionJobData,
  closeHeavyQueueEvents,
  closeIntegrationQueueEvents,
  defaultWorkerOptions,
  getHeavyJobCompletionWaitTimeoutMs,
  getRedisConnection,
  HeavyJobAction,
  IntegrationJobAction,
  type IntegrationJobData,
  integrationQueue,
  queueNames,
  WhatsappVoipSignalingJobAction,
  type WhatsappVoipSignalingJobData,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { ensureBootstrapped } from "../lib/bootstrap"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { hasExhaustedAttempts } from "../lib/job-attempts"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { integrationService } from "../services/integrations"
import { handleAdsAutomaticEvent } from "./handlers/ads-automatic-event"
import { dispatchAdsConversionJob } from "./handlers/ads-conversion/registry"
import { runChallenge } from "./handlers/challenge"
import { coexistAttachmentDownload } from "./handlers/coexist/attachment-download"
import { coexistInstagramSync } from "./handlers/coexist/instagram-sync"
import { coexistMessengerSync } from "./handlers/coexist/messenger-sync"
import { coexistWhatsappBuffer } from "./handlers/coexist/whatsapp-buffer"
import { coexistWhatsappFlush } from "./handlers/coexist/whatsapp-flush"
import { processCommentAutomation } from "./handlers/comment-automation"
import { updateContactAvatar } from "./handlers/contact/update-avatar"
import { runContactScan } from "./handlers/contact-scan/engine"
import { agentMarkAsRead, contactMarkAsRead } from "./handlers/conversation"
import {
  runFlowNode,
  runFlowPostback,
  runFlowQuickReply,
} from "./handlers/flow"
import { runFollowUpResume } from "./handlers/follow-up"
import { resumeHeavyStep } from "./handlers/heavy-step-resume"
import { handleChannelLabelWebhook } from "./handlers/inbox_labels"
import { processLeadgen } from "./handlers/lead-ads"
import { handleMessageStatus } from "./handlers/message-status"
import { handleSendMetaCapiEvent } from "./handlers/meta-conversions/send-meta-capi-event"
import {
  deleteIncomingComment,
  deleteIncomingMessage,
  processMessageReaction,
  receiveComment,
  receiveMessage,
  updateIncomingComment,
} from "./handlers/received-message"
import { runRef } from "./handlers/ref"
import { handleSendSequenceFlow } from "./handlers/sequence-flow"
import { captureTemplateFlowResponse } from "./handlers/template-flow-response"
import { runWaitResume } from "./handlers/wait-resume"
import { handleWhatsappCallEvent } from "./handlers/whatsapp-call"
import { handleWhatsappCallNativeRecordingFetch } from "./handlers/whatsapp-call-native-recording"
import { handleWhatsappCallNativeTranscriptFetch } from "./handlers/whatsapp-call-native-transcript"
import { handleWhatsappCallRecordingReady } from "./handlers/whatsapp-call-recording"
import { handleWhatsappCallTranscribe } from "./handlers/whatsapp-call-transcribe"
import {
  finalizeExhaustedHandleConnect,
  handleWhatsappVoipSignalingJob,
} from "./handlers/whatsapp-voip-signaling"
import { runIntegrationJobWithWebhookContext } from "./job-context"
import { resolveIncomingTextRouting } from "./routing"
import { closeChatQueueEvents } from "./utils/message"

const integrationWorkerLockDuration = Math.max(
  10 * 60 * 1000,
  getHeavyJobCompletionWaitTimeoutMs(
    HeavyJobAction.aiGenerateImage,
    env.HEAVY_JOB_WAIT_TIMEOUT_MS,
  ) + 60_000,
)

function normalizeToId(value: string | { id: string }): string {
  return typeof value === "string" ? value : value.id
}

function hashLegacyPayload(payload: object): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24)
}

function getFlowExecutionKey(job: Job): string {
  if (job.id) {
    return job.id
  }

  const flowExecutionKey = `integration-job-${createId()}`
  logger.warn(
    { flowExecutionKey, jobName: job.name },
    "Integration job is missing id; generated flow execution key",
  )
  return flowExecutionKey
}

/**
 * The workspace a VoIP signaling job belongs to, for the blocked-owner guard.
 * Outbound jobs carry `workspaceId`; inbound jobs only carry the business
 * `phoneNumberId`, resolved through its integration. `undefined` when that
 * lookup fails — the guard then runs the job, and the handler reports the
 * missing integration itself.
 */
async function resolveVoipSignalingWorkspaceId(
  job: WhatsappVoipSignalingJobData,
): Promise<string | undefined> {
  if ("workspaceId" in job.data) {
    return job.data.workspaceId
  }
  try {
    const { inbox } =
      await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
        channelTypes.enum.whatsapp,
        job.data.phoneNumberId,
      )
    return inbox.workspaceId
  } catch (err) {
    logger.warn(
      { err, phoneNumberId: job.data.phoneNumberId },
      "WhatsApp VoIP signaling: unable to resolve workspace for the blocked-owner guard",
    )
    return
  }
}

async function startIntegrationWorker() {
  try {
    await ensureBootstrapped()
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap integration worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.integration,
    async (job: Job<IntegrationJobData>) => {
      const workspaceId = await resolveWorkspaceId(job.data.data)
      if (await isBlockedWorkspace(workspaceId)) {
        return
      }

      return await runIntegrationJobWithWebhookContext(job.data, () =>
        runJobWithAuditContext(
          { workspaceId, source: `integration:${job.data.type}` },
          async () => {
            switch (job.data.type) {
              case IntegrationJobAction.incomingMessage: {
                const {
                  message,
                  postbackAction,
                  quickReplyAction,
                  conversation,
                  channelType,
                } = await receiveMessage(job.data.data)

                if (!message) {
                  return
                }

                const isNotPostbackOrQuickReply = !(
                  postbackAction || quickReplyAction
                )

                // An image/file message has contentType "text" — only its
                // `attachments` array distinguishes it; a shared location has
                // contentType "location".
                const isFromContact =
                  isNotPostbackOrQuickReply && message.senderType === "contact"
                const hasAttachment = message.attachments.length > 0
                const isLocation = message.contentType === "location"

                const storyReply = getStoryReply(message.contentAttributes)

                const callPermissionReply = getWhatsappCallPermissionReply(
                  message.contentAttributes,
                )
                if (isFromContact && callPermissionReply) {
                  await whatsappCallPermissionService.recordReply({
                    workspaceId: conversation.workspaceId,
                    contactInboxId: message.contactInboxId,
                    response: callPermissionReply.response,
                    isPermanent: callPermissionReply.isPermanent === true,
                    expirationTimestamp:
                      callPermissionReply.expirationTimestamp,
                    respondedAt: message.createdAt,
                  })
                  return
                }

                if (isFromContact && storyReply) {
                  await aiAgentQueue.add(
                    AIJobAction.processStoryReplyAutomation,
                    {
                      type: AIJobAction.processStoryReplyAutomation,
                      data: {
                        workspaceId: conversation.workspaceId,
                        conversationId: conversation.id,
                        contactInboxId: message.contactInboxId,
                        messageId: message.id,
                        storyId: storyReply.id,
                        storyUrl: storyReply.url,
                        message: message.text ?? undefined,
                        channelType,
                      },
                    },
                    { jobId: `story-reply-auto-${message.id}` },
                  )
                  return
                }

                const routing = await resolveIncomingTextRouting({
                  conversation,
                  hasActionableInput: Boolean(
                    isFromContact &&
                      (message.text || hasAttachment || isLocation),
                  ),
                  hasText: Boolean(isFromContact && message.text),
                  isConversationActive: (conversation) =>
                    conversationService.ensureActive(conversation),
                })

                if (routing.type === "challenge") {
                  await integrationQueue.add(
                    IntegrationJobAction.runChallenge,
                    {
                      type: IntegrationJobAction.runChallenge,
                      data: {
                        conversationId: routing.conversation.id,
                        contactInboxId: message.contactInboxId,
                        messageId: message.id,
                        messageCreatedAt: message.createdAt,
                        challenge: routing.challenge,
                      },
                    },
                    {
                      jobId: `questionnaire-challenge-${routing.conversation.id}-${message.id}`,
                    },
                  )
                } else if (routing.type === "automatedResponse") {
                  await automatedResponseService.enqueue({
                    conversationId: routing.conversation.id,
                    contactInboxId: message.contactInboxId,
                    messageId: message.id,
                    messageText: message.text ?? "",
                    workspaceId: routing.conversation.workspaceId,
                  })
                } else if (isNotPostbackOrQuickReply) {
                  // Track no response for messages without content or not from contact
                  // (postback/quickReply are tracked in their own handlers)
                  await emit("analytics:dashboard", {
                    eventType: "message:bot_received",
                    workspaceId: message.workspaceId,
                    conversationId: message.conversationId,
                    messageId: message.id,
                    occurredAt: new Date(),
                    hasResponse: false,
                    responseType: "none",
                    routeType: "fallback",
                    result: "fallback",
                    aiProvider: "none",
                    metadata: {
                      latency: 0,
                      fallbackReason: message.text
                        ? "not_from_contact"
                        : "no_content",
                    },
                  })
                }
                return
              }
              case IntegrationJobAction.incomingComment: {
                await receiveComment(job.data.data)
                return
              }
              case IntegrationJobAction.updateIncomingComment: {
                await updateIncomingComment(job.data.data)
                return
              }
              case IntegrationJobAction.deleteIncomingComment: {
                await deleteIncomingComment(job.data.data)
                return
              }
              case IntegrationJobAction.deleteIncomingMessage: {
                await deleteIncomingMessage(job.data.data)
                return
              }
              case IntegrationJobAction.messageReaction: {
                await processMessageReaction(job.data.data)
                return
              }
              case IntegrationJobAction.sendFlow: {
                await runFlowNode(job.data.data, {
                  flowExecutionKey:
                    job.data.data.flowExecutionKey ?? getFlowExecutionKey(job),
                })
                return
              }
              case IntegrationJobAction.resumeHeavyStep: {
                await resumeHeavyStep(job.data.data)
                return
              }
              case IntegrationJobAction.sendSequenceFlow: {
                await handleSendSequenceFlow(job.data.data, job)
                return
              }
              case IntegrationJobAction.runFlowPostback: {
                await runFlowPostback(job.data.data, {
                  flowExecutionKey: getFlowExecutionKey(job),
                })
                return
              }
              case IntegrationJobAction.runFlowQuickReply: {
                await runFlowQuickReply(job.data.data, {
                  flowExecutionKey: getFlowExecutionKey(job),
                })
                return
              }
              case IntegrationJobAction.processAutomatedResonse: {
                await aiAgentQueue.add(
                  AIJobAction.processAutomatedResponse,
                  {
                    type: AIJobAction.processAutomatedResponse,
                    data: {
                      conversationId: normalizeToId(
                        job.data.data.conversationId,
                      ),
                      contactInboxId: normalizeToId(
                        job.data.data.contactInboxId,
                      ),
                      messageId: job.data.data.messageId,
                    },
                  },
                  {
                    jobId: `automated-response-${job.data.data.messageId}`,
                  },
                )
                return
              }
              case IntegrationJobAction.agentMarkAsRead: {
                await agentMarkAsRead(job.data.data)
                return
              }
              case IntegrationJobAction.contactMarkAsRead: {
                await contactMarkAsRead(job.data.data)
                return
              }
              case IntegrationJobAction.runRef: {
                await runRef(job.data.data)
                return
              }
              case IntegrationJobAction.runChallenge: {
                await runChallenge(job.data.data)
                return
              }
              case IntegrationJobAction.resumeWait: {
                await runWaitResume(job.data.data, job)
                return
              }
              case IntegrationJobAction.resumeFollowUp: {
                await runFollowUpResume(job.data.data)
                return
              }
              case IntegrationJobAction.messageStatus: {
                await handleMessageStatus(job.data.data, job)
                return
              }
              case IntegrationJobAction.coexistWhatsappBuffer: {
                await coexistWhatsappBuffer(job.data.data)
                return
              }
              case IntegrationJobAction.channelLabelChange: {
                await handleChannelLabelWebhook(job.data.data)
                return
              }
              case IntegrationJobAction.coexistWhatsappFlush: {
                await coexistWhatsappFlush(job.data.data)
                return
              }
              case IntegrationJobAction.coexistMessengerSync: {
                await coexistMessengerSync(job.data.data)
                return
              }
              case IntegrationJobAction.coexistInstagramSync: {
                await coexistInstagramSync(job.data.data)
                return
              }
              case IntegrationJobAction.coexistAttachmentDownload: {
                await coexistAttachmentDownload(job.data.data)
                return
              }
              case IntegrationJobAction.adsAutomaticEvent: {
                await handleAdsAutomaticEvent(job.data.data)
                return
              }
              case IntegrationJobAction.whatsappCallEvent: {
                await handleWhatsappCallEvent(job.data.data)
                return
              }
              case IntegrationJobAction.whatsappCallRecordingReady: {
                await handleWhatsappCallRecordingReady(job.data.data)
                return
              }
              case IntegrationJobAction.whatsappCallNativeRecordingFetch: {
                await handleWhatsappCallNativeRecordingFetch(job.data.data)
                return
              }
              case IntegrationJobAction.whatsappCallNativeTranscriptFetch: {
                await handleWhatsappCallNativeTranscriptFetch(job.data.data)
                return
              }
              case IntegrationJobAction.evaluateTemplateSent:
              case IntegrationJobAction.evaluateConversionTrigger:
              case IntegrationJobAction.sendConversionEvent:
              case IntegrationJobAction.syncRetargetAudience: {
                await dispatchAdsConversionJob(job.data)
                return
              }
              case IntegrationJobAction.sendMetaCapiEvent: {
                await handleSendMetaCapiEvent(job.data.data)
                return
              }
              case IntegrationJobAction.updateContactAvatar: {
                await updateContactAvatar(job.data.data)
                return
              }
              case IntegrationJobAction.contactScan: {
                await runContactScan(job.data.data)
                return
              }
              case IntegrationJobAction.processCommentAutomation: {
                await processCommentAutomation(job.data.data)
                return
              }
              case IntegrationJobAction.commentAIReply: {
                const payloadHash = hashLegacyPayload(job.data.data)
                const automationId =
                  "automationId" in job.data.data &&
                  typeof job.data.data.automationId === "string" &&
                  job.data.data.automationId.length > 0
                    ? job.data.data.automationId
                    : undefined

                await aiAgentQueue.add(
                  AIJobAction.commentAIReply,
                  {
                    type: AIJobAction.commentAIReply,
                    data: {
                      ...job.data.data,
                      automationId: automationId ?? `legacy-${payloadHash}`,
                    },
                  },
                  {
                    jobId: automationId
                      ? `comment-ai-reply-${automationId}-${job.data.data.commentId}-${job.data.data.replyChannel}`
                      : `comment-ai-reply-legacy-${job.data.data.commentId}-${job.data.data.replyChannel}-${payloadHash}`,
                  },
                )
                return
              }
              case IntegrationJobAction.processStoryReplyAutomation: {
                await aiAgentQueue.add(
                  AIJobAction.processStoryReplyAutomation,
                  {
                    type: AIJobAction.processStoryReplyAutomation,
                    data: job.data.data,
                  },
                  {
                    jobId: `story-reply-auto-${job.data.data.messageId}`,
                  },
                )
                return
              }
              case IntegrationJobAction.captureTemplateFlowResponse: {
                await captureTemplateFlowResponse(job.data.data)
                return
              }
              case IntegrationJobAction.processLeadgen: {
                await processLeadgen(job.data.data, job)
                return
              }
              case IntegrationJobAction.createMessage: {
                // No-op — action type exists in the union but has no enqueuer yet.
                return
              }
              default: {
                // Exhaustiveness guard — adding a new IntegrationJobData variant
                // without handling it here becomes a compile error.
                const _exhaustive: never = job.data
                logger.warn(
                  { data: _exhaustive },
                  "Unhandled integration job type",
                )
                return
              }
            }
          },
        ),
      )
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      // Override the shared default (5). I/O-bound webhook handling tolerates
      // more parallelism; env-tunable via INTEGRATION_WORKER_CONCURRENCY.
      concurrency: env.INTEGRATION_WORKER_CONCURRENCY,
      // Coexist historical sync chunks are bounded to ~4 min via self-continuation
      // (see coexist-messenger-sync / coexist-whatsapp-flush). Lock sized as:
      // 4 min active + 4 min Graph 5xx retry tail + 2 min bulk INSERT tail.
      // Heavy flow steps also wait for every configured provider retry and
      // backoff; their full budget must fit within the parent job lock.
      lockDuration: integrationWorkerLockDuration,
      stalledInterval: integrationWorkerLockDuration,
      maxStalledCount: 1,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error({ err }, `Job ${job.id} has failed`)
    }
  })

  // Dedicated, rate-limited consumer for call transcription:
  // a second `Worker` instance in this same process, on its own queue, so
  // its `limiter` bounds transcription throughput independent of the
  // shared `integration` queue's traffic/concurrency.
  const callTranscriptionWorker = new Worker(
    queueNames.enum.callTranscription,
    async (job: Job<CallTranscriptionJobData>) => {
      const workspaceId = job.data.data.workspaceId
      await withBlockedOwnerGuard(workspaceId, async () => {
        await runJobWithAuditContext(
          { workspaceId, source: `integration:${job.data.type}` },
          async () => {
            await handleWhatsappCallTranscribe(job.data.data)
          },
        )
      })
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
      limiter: { max: env.CALL_TRANSCRIBE_PER_MIN, duration: 60_000 },
    },
  )

  callTranscriptionWorker.on("failed", (job, err) => {
    if (job) {
      logger.error({ err }, `Call transcription job ${job.id} has failed`)
    }
  })

  // Dedicated consumer for WhatsApp Business Calling VoIP-mode signaling: a
  // third `Worker` instance in this same process, on its own queue — the
  // shared `integration` queue's traffic/concurrency must never starve the
  // 30-60s Meta answer-deadline window (docs/whatsapp-calling-voip.md
  // contract #3). `resolveWorkspaceId`'s generic resolvers don't know about
  // `phoneNumberId`, so the workspace is resolved directly here for the
  // frozen-workspace guard; the handler resolves the integration again for
  // its own purposes (auth, inboxId) — same redundant-resolution shape as
  // the main `worker` processor above and its handlers.
  const whatsappVoipSignalingWorker = new Worker<WhatsappVoipSignalingJobData>(
    queueNames.enum.whatsappVoipSignaling,
    async (job: Job<WhatsappVoipSignalingJobData>) => {
      const workspaceId = await resolveVoipSignalingWorkspaceId(job.data)

      await withBlockedOwnerGuard(workspaceId, async () => {
        await runJobWithAuditContext(
          { workspaceId, source: `integration:${job.data.type}` },
          async () => {
            await handleWhatsappVoipSignalingJob(job.data)
          },
        )
      })
    },
    {
      connection: getRedisConnection(),
      concurrency: 10,
    },
  )

  whatsappVoipSignalingWorker.on("failed", (job, err) => {
    if (!job) {
      return
    }
    // Retries here are routine, not incidents: `handleConnect` throws
    // `VoipCallRowNotReadyError` until the SEPARATE `whatsappCallEvent` job
    // creates the call row, and this queue's retry window
    // (`WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS`) exists precisely to outlast that
    // lag. Logging every attempt at ERROR made a perfectly healthy race read
    // as a dropped call. Only an exhausted job actually lost the offer.
    const attempts = job.opts.attempts ?? 1
    if (!hasExhaustedAttempts(job)) {
      logger.warn(
        { err, attempt: job.attemptsMade, attempts },
        `Whatsapp VoIP signaling job ${job.id} attempt failed; retrying`,
      )
      return
    }
    logger.error(
      { err, attempts },
      `Whatsapp VoIP signaling job ${job.id} has failed`,
    )
    // Bug 2 safety net: a `handleConnect` job that exhausted every attempt
    // (`removeOnFail: true` deletes it from Redis right after this) must not
    // silently strand the call at `ringing` — finalize it here instead of
    // leaving it entirely to the 5-minute stale-call sweep. This listener
    // isn't awaited by BullMQ, so the call is fire-and-forget; `.catch` is
    // belt-and-suspenders since `finalizeExhaustedHandleConnect` already
    // logs its own failures internally and never rejects.
    if (job.data.type === WhatsappVoipSignalingJobAction.handleConnect) {
      finalizeExhaustedHandleConnect(job.data.data).catch((finalizeErr) => {
        logger.error(
          { err: finalizeErr, wacid: job.data.data.wacid },
          "Whatsapp VoIP signaling: finalizeExhaustedHandleConnect rejected unexpectedly",
        )
      })
    }
  })

  let isShuttingDown = false
  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    try {
      await worker.close()
      await Promise.all([
        callTranscriptionWorker.close(),
        whatsappVoipSignalingWorker.close(),
        closeChatQueueEvents(),
        closeIntegrationQueueEvents(),
        closeHeavyQueueEvents(),
      ])
      process.exit(0)
    } catch (err) {
      logger.error(err, "[IntegrationWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startIntegrationWorker().catch((err) => {
  logger.error({ err }, "Failed to start integration worker")
  process.exit(1)
})
