import { createHash } from "node:crypto"
import { withBlockedOwnerGuard } from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  AIJobAction,
  aiAgentQueue,
  type CallTranscriptionJobData,
  chatQueue,
  getHeavyJobCompletionWaitTimeoutMs,
  HeavyJobAction,
  IntegrationJobAction,
  type IntegrationJobData,
  integrationQueue,
  lowQueue,
  queueNames,
  WhatsappVoipSignalingJobAction,
  type WhatsappVoipSignalingJobData,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { env } from "../env"
import { createQueueWorker } from "../lib/create-queue-worker"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { hasExhaustedAttempts } from "../lib/job-attempts"
import { deferOnLockContention } from "../lib/lock-contention-deferral"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { onShutdown, runWorker } from "../lib/shutdown"
import { integrationService } from "../services/integrations"
import { mintRandomFlowExecutionKey } from "./flow-execution-key"
import { handleAdsAutomaticEvent } from "./handlers/ads-automatic-event"
import { dispatchAdsConversionJob } from "./handlers/ads-conversion/registry"
import { runAiHandoverBulkToggle } from "./handlers/ai-handover-bulk-toggle"
import { runAiHandoverTakeBack } from "./handlers/ai-handover-take-back"
import { runChallenge } from "./handlers/challenge"
import { processChannelAudienceEvent } from "./handlers/channel-audience-event"
import { coexistAttachmentDownload } from "./handlers/coexist/attachment-download"
import { coexistInstagramSync } from "./handlers/coexist/instagram-sync"
import { coexistMessengerSync } from "./handlers/coexist/messenger-sync"
import { coexistWhatsappBuffer } from "./handlers/coexist/whatsapp-buffer"
import { coexistWhatsappFlush } from "./handlers/coexist/whatsapp-flush"
import { processCommentAutomation } from "./handlers/comment-automation"
import { runDeferredCommentPrivateReply } from "./handlers/comment-automation/deferred-private-reply"
import { runAsMissedCommentReplay } from "./handlers/comment-automation/replay-priority"
import { confirmOrderPayment } from "./handlers/confirm-order-payment"
import { updateContactAvatar } from "./handlers/contact/update-avatar"
import { runContactScan } from "./handlers/contact-scan/engine"
import { agentMarkAsRead, contactMarkAsRead } from "./handlers/conversation"
import {
  runFlowNode,
  runFlowPostback,
  runFlowQuickReply,
} from "./handlers/flow"
import { runFollowUpResume } from "./handlers/follow-up"
import { handleSendGoogleAdsConversion } from "./handlers/google-ads/send-conversion"
import { resumeHeavyStep } from "./handlers/heavy-step-resume"
import { handleChannelLabelWebhook } from "./handlers/inbox_labels"
import { processIncomingMessage } from "./handlers/incoming-message"
import { processLeadgen } from "./handlers/lead-ads"
import { processMarketingMessageWebhook } from "./handlers/marketing-message-webhook"
import { handleMessageStatus } from "./handlers/message-status"
import { handleSendMetaCapiEvent } from "./handlers/meta-conversions/send-meta-capi-event"
import { handleProviderAccountEvent } from "./handlers/provider-account-event"
import { runQuickReplyFollowUpResume } from "./handlers/quick-reply-resume"
import {
  deleteIncomingComment,
  deleteIncomingMessage,
  processMessageReaction,
  receiveComment,
  updateIncomingComment,
} from "./handlers/received-message"
import { runRef } from "./handlers/ref"
import { replyToInboundCart } from "./handlers/reply-to-inbound-cart"
import { recordEmailTrackingTransition } from "./handlers/send-email"
import { handleSendSequenceFlow } from "./handlers/sequence-flow"
import { runShopifySync, runShopifyWebhook } from "./handlers/shopify"
import {
  runStepInputResolution,
  runStepInputTimeoutResume,
} from "./handlers/step-input-resolution"
import { captureTemplateFlowResponse } from "./handlers/template-flow-response"
import {
  isThreadControlJobReprocess,
  receiveThreadControlEvent,
  releaseOwnedThread,
} from "./handlers/thread-control"
import { receiveTiktokHighIntentComment } from "./handlers/tiktok-high-intent-comment"
import { runWaitResume } from "./handlers/wait-resume"
import { handleWhatsappCallEvent } from "./handlers/whatsapp-call"
import { handleWhatsappCallNativeRecordingFetch } from "./handlers/whatsapp-call-native-recording"
import { handleWhatsappCallNativeTranscriptFetch } from "./handlers/whatsapp-call-native-transcript"
import { handleWhatsappCallRecordingReady } from "./handlers/whatsapp-call-recording"
import { handleWhatsappCallTranscribe } from "./handlers/whatsapp-call-transcribe"
import { handleWhatsappIdentityChange } from "./handlers/whatsapp-identity-change"
import {
  finalizeExhaustedHandleConnect,
  handleWhatsappVoipSignalingJob,
} from "./handlers/whatsapp-voip-signaling"
import {
  runWooCommerceSync,
  runWooCommerceWebhook,
} from "./handlers/woocommerce"
import { runIntegrationJobWithWebhookContext } from "./job-context"

// Coexist historical sync chunks are bounded to ~4 min via self-continuation
// (see coexist-messenger-sync / coexist-whatsapp-flush). Lock sized as:
// 4 min active + 4 min Graph 5xx retry tail + 2 min bulk INSERT tail.
// Heavy flow steps also wait for every configured provider retry and
// backoff; their full budget must fit within the parent job lock. The event
// loop is shared in `standalone`, so the lock must not be shortened to rely on
// timely renewal.
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
    // The creation time is fixed for the job's retries but differs when a
    // job id is reused (a fixed id, or a counter restarted after a Redis loss).
    return `${job.id}:${job.timestamp}`
  }

  const flowExecutionKey = mintRandomFlowExecutionKey("integration-job-")
  logger.warn(
    { flowExecutionKey, jobName: job.name },
    "Integration job is missing id; generated flow execution key",
  )
  return flowExecutionKey
}

/**
 * The workspace a VoIP signaling job belongs to, for the blocked-owner guard.
 * Outbound jobs carry workspaceId; inbound jobs only carry the phoneNumberId,
 * resolved through its integration. undefined when that lookup fails — the
 * guard then runs the job and the handler reports the missing integration
 * itself.
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

function handleVoipSignalingFailed(
  job: Job<WhatsappVoipSignalingJobData> | undefined,
  err: Error,
): void {
  if (!job) {
    return
  }
  // Retries here are routine, not incidents: handleConnect throws
  // VoipCallRowNotReadyError until the separate whatsappCallEvent job creates
  // the call row, and this queue's retry window exists precisely to outlast
  // that lag. Logging every attempt at ERROR made a healthy race read as a
  // dropped call. Only an exhausted job actually lost the offer.
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
  // Safety net: a handleConnect job that exhausted every attempt
  // (removeOnFail deletes it from Redis right after this) must not silently
  // strand the call at ringing — finalize it here instead of leaving it
  // entirely to the 5-minute stale-call sweep. This listener isn't awaited by
  // BullMQ, so the call is fire-and-forget; .catch is belt-and-suspenders
  // since finalizeExhaustedHandleConnect already logs its own failures and
  // never rejects.
  if (job.data.type === WhatsappVoipSignalingJobAction.handleConnect) {
    finalizeExhaustedHandleConnect(job.data.data).catch((finalizeErr) => {
      logger.error(
        { err: finalizeErr, wacid: job.data.data.wacid },
        "Whatsapp VoIP signaling: finalizeExhaustedHandleConnect rejected unexpectedly",
      )
    })
  }
}

const QUEUE_DEPTH_LOG_INTERVAL_MS = 60_000

const depthLoggedQueues = [
  { name: queueNames.enum.integration, queue: integrationQueue },
  { name: queueNames.enum.chat, queue: chatQueue },
  { name: queueNames.enum.low, queue: lowQueue },
] as const

/**
 * Logs how deep the queues behind customer replies are, once a minute. The
 * numbers tell an operator whether `integration` is backed up (raise its
 * concurrency), `chat` is (raise `CHAT_WORKER_CONCURRENCY`), or `low` is (the
 * bookkeeping ingress is behind). `prioritized` holds broadcast, sequence and
 * replay sends, which wait behind live traffic by design.
 */
function startQueueDepthLogging(): void {
  const logDepths = async () => {
    for (const { name, queue } of depthLoggedQueues) {
      try {
        const counts = await queue.getJobCounts(
          "waiting",
          "prioritized",
          "delayed",
          "active",
        )
        logger.info({ queue: name, ...counts }, "Queue depth")
      } catch (err) {
        logger.warn({ err, queue: name }, "Failed to read queue depth")
      }
    }
  }

  const timer = setInterval(() => {
    logDepths().catch((err: unknown) => {
      logger.warn({ err }, "Failed to log queue depth")
    })
  }, QUEUE_DEPTH_LOG_INTERVAL_MS)
  timer.unref()
  onShutdown("queue-depth-logging", () => clearInterval(timer))
}

function startIntegrationWorker() {
  const processIntegrationJob = async (job: Job<IntegrationJobData>) => {
    const workspaceId = await resolveWorkspaceId(job.data.data)
    if (await isBlockedWorkspace(workspaceId)) {
      return
    }

    return await runIntegrationJobWithWebhookContext(job.data, () =>
      runJobWithAuditContext(
        { workspaceId, source: `integration:${job.data.type}` },
        async () => {
          switch (job.data.type) {
            case IntegrationJobAction.incomingMessage:
            case IntegrationJobAction.incomingMessageEcho: {
              await processIncomingMessage(job.data.data)
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
            case IntegrationJobAction.channelAudienceEvent: {
              await processChannelAudienceEvent(job.data.data)
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
                    conversationId: normalizeToId(job.data.data.conversationId),
                    contactInboxId: normalizeToId(job.data.data.contactInboxId),
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
            case IntegrationJobAction.resumeQuickReplyFollowUp: {
              await runQuickReplyFollowUpResume(job.data.data)
              return
            }
            case IntegrationJobAction.resumeStepInputTimeout: {
              await runStepInputTimeoutResume(job.data.data)
              return
            }
            case IntegrationJobAction.resolveStepInput: {
              await runStepInputResolution(job.data.data)
              return
            }
            case IntegrationJobAction.messageStatus: {
              await handleMessageStatus(job.data.data, job)
              return
            }
            case IntegrationJobAction.recordEmailTrackingTransition: {
              await recordEmailTrackingTransition(job.data.data)
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
              await coexistAttachmentDownload(job, job.data.data)
              return
            }
            case IntegrationJobAction.adsAutomaticEvent: {
              await handleAdsAutomaticEvent(job.data.data)
              return
            }
            case IntegrationJobAction.providerAccountEvent: {
              await handleProviderAccountEvent(job.data.data)
              return
            }
            case IntegrationJobAction.whatsappCallEvent: {
              await handleWhatsappCallEvent(job.data.data)
              return
            }
            case IntegrationJobAction.whatsappIdentityChange: {
              await handleWhatsappIdentityChange(job.data.data)
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
            case IntegrationJobAction.sendGoogleAdsConversion: {
              await handleSendGoogleAdsConversion(job.data.data, job)
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
              const commentAutomationData = job.data.data
              await (commentAutomationData.replay
                ? runAsMissedCommentReplay(() =>
                    processCommentAutomation(commentAutomationData),
                  )
                : processCommentAutomation(commentAutomationData))
              return
            }
            case IntegrationJobAction.tiktokHighIntentComment: {
              await receiveTiktokHighIntentComment(job.data.data)
              return
            }
            case IntegrationJobAction.deferredCommentPrivateReply: {
              await runDeferredCommentPrivateReply(job.data.data)
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
            case IntegrationJobAction.replyToInboundCart: {
              await replyToInboundCart(job.data.data)
              return
            }
            case IntegrationJobAction.confirmOrderPayment: {
              await confirmOrderPayment(job.data.data)
              return
            }
            case IntegrationJobAction.shopifySync: {
              await runShopifySync(job.data.data)
              return
            }
            case IntegrationJobAction.shopifyWebhook: {
              await runShopifyWebhook(job.data.data)
              return
            }
            case IntegrationJobAction.woocommerceSync: {
              await runWooCommerceSync(job.data.data)
              return
            }
            case IntegrationJobAction.woocommerceWebhook: {
              await runWooCommerceWebhook(job.data.data)
              return
            }
            case IntegrationJobAction.processLeadgen: {
              await processLeadgen(job.data.data, job)
              return
            }
            case IntegrationJobAction.processMarketingMessageWebhook: {
              await processMarketingMessageWebhook(job.data.data)
              return
            }
            case IntegrationJobAction.threadControlEvent: {
              await receiveThreadControlEvent(job.data.data, {
                isRetry: isThreadControlJobReprocess(job),
                jobId: job.id,
              })
              return
            }
            case IntegrationJobAction.threadControlAction: {
              await releaseOwnedThread(job.data.data)
              return
            }
            case IntegrationJobAction.aiHandoverBulkToggle: {
              await runAiHandoverBulkToggle(job.data.data)
              return
            }
            case IntegrationJobAction.aiHandoverTakeBack: {
              await runAiHandoverTakeBack(job.data.data)
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
  }

  startQueueDepthLogging()

  // A job that lost a distributed-lock race (e.g. the per-owner MAC lock when
  // many new contacts arrive at once) is deferred, not failed: failing it
  // burns one of only two attempts and drops the inbound message.
  createQueueWorker(
    queueNames.enum.integration,
    (job: Job<IntegrationJobData>, token) =>
      deferOnLockContention(job, token, () => processIntegrationJob(job)),
    {
      // Override the shared default (5). I/O-bound webhook handling tolerates
      // more parallelism; env-tunable via INTEGRATION_WORKER_CONCURRENCY.
      concurrency: env.INTEGRATION_WORKER_CONCURRENCY,
      lockDuration: integrationWorkerLockDuration,
      stalledInterval: integrationWorkerLockDuration,
      maxStalledCount: 1,
    },
  )

  // Dedicated, rate-limited consumer for call transcription: a second Worker
  // instance in this process, on its own queue, so its limiter bounds
  // transcription throughput independent of the shared integration queue.
  createQueueWorker(
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
      concurrency: 1,
      limiter: { max: env.CALL_TRANSCRIBE_PER_MIN, duration: 60_000 },
    },
  )

  // Dedicated consumer for WhatsApp Business Calling VoIP-mode signaling: a
  // third Worker instance on its own queue, since the shared integration
  // queue's traffic must never starve the 30-60s Meta answer-deadline window.
  // resolveWorkspaceId's generic resolvers don't know about phoneNumberId, so
  // the workspace is resolved directly here for the frozen-workspace guard; the
  // handler resolves the integration again for its own purposes.
  createQueueWorker<WhatsappVoipSignalingJobData>(
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
      concurrency: 10,
      onFailed: handleVoipSignalingFailed,
    },
  )
}

runWorker("integration", startIntegrationWorker)
