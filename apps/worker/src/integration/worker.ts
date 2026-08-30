import { automatedResponseService } from "@chatbotx.io/automated-response"
import { conversationService } from "@chatbotx.io/business"
import { emit } from "@chatbotx.io/event-bus"
import { getStoryReply } from "@chatbotx.io/sdk"
import {
  closeIntegrationQueueEvents,
  defaultWorkerOptions,
  getRedisConnection,
  heavyJobDataSchema,
  heavyQueue,
  IntegrationJobAction,
  type IntegrationJobData,
  integrationQueue,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { ensureBootstrapped } from "../lib/bootstrap"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { handleAdsAutomaticEvent } from "./handlers/ads-automatic-event"
import { dispatchAdsConversionJob } from "./handlers/ads-conversion/registry"
import { processAutomatedResponse } from "./handlers/automated-response"
import { runChallenge } from "./handlers/challenge"
import { processCommentAutomation } from "./handlers/comment-automation"
import { processCommentAIReply } from "./handlers/comment-automation/ai-reply"
import { updateContactAvatar } from "./handlers/contact/update-avatar"
import { agentMarkAsRead, contactMarkAsRead } from "./handlers/conversation"
import {
  runFlowNode,
  runFlowPostback,
  runFlowQuickReply,
} from "./handlers/flow"
import { runFollowUpResume } from "./handlers/follow-up"
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
import { processStoryReplyAutomation } from "./handlers/story-reply-automation"
import { captureTemplateFlowResponse } from "./handlers/template-flow-response"
import { runWaitResume } from "./handlers/wait-resume"
import { runIntegrationJobWithWebhookContext } from "./job-context"
import { resolveIncomingTextRouting } from "./routing"
import { closeChatQueueEvents } from "./utils/message"

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
            // ── FORWARD-ONLY SHIM (remove after bull:integration holds no
            //    coexist jobs; see scripts/check-coexist-drain.mts) ────────
            //
            // The 5 coexist actions moved to the `heavy` queue/worker, but
            // `bull:integration` survives a deploy: legacy coexist jobs
            // (waiting, delayed ~60s flushes, retrying) are still there after
            // cutover. `job.data` is typed `IntegrationJobData`, which no
            // longer includes these actions, so a legacy payload can only be
            // recognized by parsing — not casting — the raw value against the
            // runtime `heavyJobDataSchema`.
            //
            // Production deploys are Docker Swarm stop-first: the old
            // integration worker image is fully stopped before the new one
            // (which owns none of the coexist handlers) starts, so old and
            // new code never run concurrently. That makes it safe to forward
            // EVERY recognized legacy action — including flush — into the
            // `heavy` queue's single jobId namespace instead of executing any
            // of them in place, which lets this worker drop all coexist
            // handler knowledge. The forward preserves the original jobId
            // (dedup-safe) and opts, minus `delay`/`repeat` (already consumed
            // by having reached execution here; re-adding them would
            // re-schedule/re-repeat the job on the heavy queue).
            //
            // Caveat: attempts state restarts fresh on the forwarded job —
            // acceptable, since the default `attempts: 2` retry plus the
            // scan-runs DB-side attempt tracking (`CoexistSyncRun.attempts`)
            // remains the real retry authority for sync runs.
            const legacy = heavyJobDataSchema.safeParse(job.data)
            if (legacy.success) {
              const { delay: _delay, repeat: _repeat, ...opts } = job.opts
              await heavyQueue.add(job.name, legacy.data, {
                ...opts,
                jobId: job.opts.jobId ?? job.id,
              })
              return
            }

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

                if (isFromContact && storyReply) {
                  await integrationQueue.add(
                    IntegrationJobAction.processStoryReplyAutomation,
                    {
                      type: IntegrationJobAction.processStoryReplyAutomation,
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
                await runFlowNode(job.data.data)
                return
              }
              case IntegrationJobAction.sendSequenceFlow: {
                await handleSendSequenceFlow(job.data.data, job)
                return
              }
              case IntegrationJobAction.runFlowPostback: {
                await runFlowPostback(job.data.data)
                return
              }
              case IntegrationJobAction.runFlowQuickReply: {
                await runFlowQuickReply(job.data.data)
                return
              }
              case IntegrationJobAction.processAutomatedResonse: {
                await processAutomatedResponse(job.data.data)
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
                await runWaitResume(job.data.data)
                return
              }
              case IntegrationJobAction.resumeFollowUp: {
                await runFollowUpResume(job.data.data)
                return
              }
              case IntegrationJobAction.messageStatus: {
                await handleMessageStatus(job.data.data)
                return
              }
              case IntegrationJobAction.channelLabelChange: {
                await handleChannelLabelWebhook(job.data.data)
                return
              }
              case IntegrationJobAction.adsAutomaticEvent: {
                await handleAdsAutomaticEvent(job.data.data)
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
              case IntegrationJobAction.processCommentAutomation: {
                await processCommentAutomation(job.data.data)
                return
              }
              case IntegrationJobAction.commentAIReply: {
                await processCommentAIReply(job.data.data)
                return
              }
              case IntegrationJobAction.processStoryReplyAutomation: {
                await processStoryReplyAutomation(job.data.data)
                return
              }
              case IntegrationJobAction.captureTemplateFlowResponse: {
                await captureTemplateFlowResponse(job.data.data)
                return
              }
              case IntegrationJobAction.processLeadgen: {
                await processLeadgen(job.data.data)
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
      // Coexist historical sync moved to its own `heavy` worker (see
      // apps/worker/src/heavy/worker.ts), which now owns the sizing rationale
      // this comment used to describe. The 10-minute lock stays here for a
      // different reason: it must stay above CHAT_JOB_WAIT_TIMEOUT_MS (max
      // 9 min, env.ts) — a shorter lock could let BullMQ treat an
      // in-progress job as stalled and double-process it while it's still
      // legitimately waiting on a chat job. A future follow-up could lower
      // the max wait to tighten this lock (see plan §7, out of scope here).
      lockDuration: 10 * 60 * 1000,
      // No stalledInterval override: with coexist gone there are no
      // long-running jobs here, so the BullMQ default (30s) applies — a
      // crashed worker's jobs are re-picked in seconds instead of minutes.
      // Live workers auto-renew their locks, so the frequent check cannot
      // false-positive an in-progress job.
      maxStalledCount: 1,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error({ err }, `Job ${job.id} has failed`)
    }
  })

  let isShuttingDown = false
  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    try {
      await Promise.all([
        worker.close(),
        closeChatQueueEvents(),
        closeIntegrationQueueEvents(),
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
