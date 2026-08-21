import type {
  MacMessageInPayload,
  MacMessageOutPayload,
} from "@chatbotx.io/analytics"
import {
  broadcastAnalyticsService,
  contactAnalyticsService,
  flowAnalyticsService,
  macTrackingService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import {
  adsConversionService,
  contactInboxService,
  workspaceUsageService,
} from "@chatbotx.io/business"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type {
  EventBusMessageMetadata,
  MessageEvenTypeMap,
  MessageFailedPayload,
  MessagePayload,
  MessageReceivedPayload,
} from "@chatbotx.io/event-bus"
import { EVENT_BUS_MESSAGE_ID } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"

/**
 * Mirrors the per-workspace MAC deltas `macTrackingService.trackMessage{In,Out}`
 * actually persisted (post dedup) onto `WorkspaceUsage.macUsed`, the same
 * display-only breakdown `quotaEnforcementService.createNewContactWithMac`
 * write-throughs at the sync chokepoint. Best-effort: a failure here never
 * affects the authoritative `UserQuota.macUsed`/`WorkspaceMac.macCount`
 * counters, which `track()` already persisted before returning.
 */
async function mirrorWorkspaceUsageMac(
  deltas: Map<string, number>,
): Promise<void> {
  await Promise.all(
    Array.from(deltas.entries()).map(([workspaceId, delta]) =>
      workspaceUsageService
        .increment(workspaceId, "mac", delta)
        .catch((err) => {
          logger.warn(
            { err, workspaceId, delta },
            "workspace usage mac increment failed",
          )
        }),
    ),
  )
}

async function trackMessageOutAndMirror(payloads: MacMessageOutPayload[]) {
  const deltas = await macTrackingService.trackMessageOut(payloads)
  await mirrorWorkspaceUsageMac(deltas)
}

async function trackMessageInAndMirror(payloads: MacMessageInPayload[]) {
  const deltas = await macTrackingService.trackMessageIn(payloads)
  await mirrorWorkspaceUsageMac(deltas)
}

function formatSendFailureError(errorData: unknown): string {
  if (errorData instanceof Error) {
    return errorData.message
  }

  if (typeof errorData === "string") {
    return errorData
  }

  if (errorData && typeof errorData === "object" && "message" in errorData) {
    const message = (errorData as { message?: unknown }).message
    if (typeof message === "string" && message.length > 0) {
      return message
    }
  }

  try {
    const serialized = JSON.stringify(errorData)
    if (serialized) {
      return serialized
    }
  } catch {
    return "Failed to send message"
  }

  return "Failed to send message"
}

/**
 * Ads conversion `contactReplied` trigger. `message:received` is a shared
 * channel — see message-status.ts, which emits the same event for outbound
 * delivery-status echoes — so only payloads carrying the `origin: "inbound"`
 * discriminant (set in received-message.ts, genuine contact-authored
 * messages only) are eligible.
 *
 * `integrationWhatsappId` is resolved per `inboxId` and cached across the
 * whole batch so a burst of inbound messages across many conversations on
 * the same WhatsApp number only costs one repository round trip per number,
 * not one per message.
 *
 * HIGH-2: this handler runs on EVERY inbound WhatsApp message platform-wide,
 * so before enqueueing it also checks the cheap cached `hasEnabledTriggerRule`
 * gate (per integrationWhatsappId, cached across the same batch the same way
 * as `integrationIdByInboxId` above) and skips entirely for the overwhelming
 * majority of workspaces that have no `contactReplied` rule configured.
 */
async function enqueueContactRepliedEvaluations(
  payloads: MessageReceivedPayload[],
) {
  const inboundWhatsappPayloads = payloads.filter(
    (payload) =>
      payload.origin === "inbound" &&
      adsConversionService.isEligibleChannel(payload.channel),
  )
  if (inboundWhatsappPayloads.length === 0) {
    return
  }

  const integrationIdByInboxId = new Map<string, string | null>()
  const hasContactRepliedRuleByIntegrationId = new Map<string, boolean>()

  for (const payload of inboundWhatsappPayloads) {
    try {
      if (!payload.messageId) {
        continue
      }

      let integrationWhatsappId = integrationIdByInboxId.get(payload.inboxId)
      if (integrationWhatsappId === undefined) {
        const integration =
          await integrationWhatsappRepository.findWorkspaceIntegrationByInboxId(
            {
              workspaceId: payload.workspaceId,
              inboxId: payload.inboxId,
            },
          )
        integrationWhatsappId = integration?.id ?? null
        integrationIdByInboxId.set(payload.inboxId, integrationWhatsappId)
      }
      if (!integrationWhatsappId) {
        continue
      }

      let hasContactRepliedRule = hasContactRepliedRuleByIntegrationId.get(
        integrationWhatsappId,
      )
      if (hasContactRepliedRule === undefined) {
        hasContactRepliedRule =
          await adsConversionService.hasEnabledTriggerRule({
            workspaceId: payload.workspaceId,
            integrationWhatsappId,
            triggerType: "contactReplied",
          })
        hasContactRepliedRuleByIntegrationId.set(
          integrationWhatsappId,
          hasContactRepliedRule,
        )
      }
      if (!hasContactRepliedRule) {
        continue
      }

      await adsConversionService.enqueueContactRepliedEvaluation({
        workspaceId: payload.workspaceId,
        integrationWhatsappId,
        contactInboxId: payload.contactInboxId,
        isFirstReply: payload.isFirstIncomingMessage ?? false,
        messageId: payload.messageId,
      })
    } catch (err) {
      logger.warn(
        { err, workspaceId: payload.workspaceId },
        "Ads contact-replied gating failed; skipping payload",
      )
    }
  }
}

type FailedPayloadWithMetadata = MessageFailedPayload & EventBusMessageMetadata

async function recordContactInboxSendFailure(payloads: MessagePayload[]) {
  const failedMessageIds: string[] = []

  for (const payload of payloads as FailedPayloadWithMetadata[]) {
    const contactInboxId = payload.context.contactInboxId
    if (!contactInboxId) {
      continue
    }

    try {
      await contactInboxService.recordSendFailure({
        contactInboxId,
        contactId: payload.context.contactId,
        workspaceId: payload.context.workspaceId,
        error: formatSendFailureError(payload.errorData),
      })
    } catch (err) {
      const eventBusMessageId = payload[EVENT_BUS_MESSAGE_ID]
      if (!eventBusMessageId) {
        throw err
      }
      failedMessageIds.push(eventBusMessageId)
    }
  }

  if (failedMessageIds.length > 0) {
    return { failedMessageIds }
  }
}

export const messageListeners: Partial<MessageEvenTypeMap> = {
  [messageEventTypeSchema.enum["message:sent"]]: [
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onMessageSent.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onMessageSent.bind(
        sequenceAnalyticsService,
      ),
    },
    {
      name: "flow-ops",
      handler: flowAnalyticsService.onMessageSent.bind(flowAnalyticsService),
    },
    {
      name: "mac-tracking",
      handler: trackMessageOutAndMirror,
    },
    {
      name: "active-hourly",
      handler:
        macTrackingService.trackMessageOutHourly.bind(macTrackingService),
    },
  ],
  [messageEventTypeSchema.enum["message:failed"]]: [
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onFailed.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onFailed.bind(sequenceAnalyticsService),
    },
    {
      name: "flow-ops",
      handler: flowAnalyticsService.onMessageFailed.bind(flowAnalyticsService),
    },
    {
      name: "contact-blocked-detection",
      handler: contactAnalyticsService.handleBlocked.bind(
        contactAnalyticsService,
      ),
    },
    {
      name: "contact-inbox-send-failure",
      handler: recordContactInboxSendFailure,
    },
  ],
  [messageEventTypeSchema.enum["message:delivered"]]: [
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onDelivered.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onDelivered.bind(
        sequenceAnalyticsService,
      ),
    },
    {
      name: "flow-ops",
      handler:
        flowAnalyticsService.onMessageDelivered.bind(flowAnalyticsService),
    },
  ],
  [messageEventTypeSchema.enum["message:seen"]]: [
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onSeen.bind(broadcastAnalyticsService),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onSeen.bind(sequenceAnalyticsService),
    },
  ],
  [messageEventTypeSchema.enum["message:received"]]: [
    {
      name: "mac-tracking",
      handler: trackMessageInAndMirror,
    },
    {
      name: "active-hourly",
      handler: macTrackingService.trackMessageInHourly.bind(macTrackingService),
    },
    {
      name: "ads-conversion-contact-replied",
      handler: enqueueContactRepliedEvaluations,
    },
  ],
}
