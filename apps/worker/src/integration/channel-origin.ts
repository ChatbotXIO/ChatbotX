import {
  IntegrationJobAction,
  type IntegrationJobData,
} from "@chatbotx.io/worker-config"

const CHANNEL_ORIGINATED_JOB_TYPES: ReadonlySet<string> = new Set([
  IntegrationJobAction.incomingMessage,
  IntegrationJobAction.incomingComment,
  IntegrationJobAction.runFlowPostback,
  IntegrationJobAction.runFlowQuickReply,
  IntegrationJobAction.runChallenge,
  IntegrationJobAction.runRef,
  IntegrationJobAction.processAutomatedResonse,
  IntegrationJobAction.channelLabelChange,
  IntegrationJobAction.processCommentAutomation,
  IntegrationJobAction.threadControlEvent,
])

const INBOUND_WEBHOOK_JOB_TYPES: ReadonlySet<string> = new Set([
  ...CHANNEL_ORIGINATED_JOB_TYPES,
  IntegrationJobAction.contactMarkAsRead,
  IntegrationJobAction.messageReaction,
  IntegrationJobAction.messageStatus,
  IntegrationJobAction.deleteIncomingMessage,
  IntegrationJobAction.updateIncomingComment,
  IntegrationJobAction.deleteIncomingComment,
  IntegrationJobAction.processLeadgen,
  IntegrationJobAction.processMarketingMessageWebhook,
  IntegrationJobAction.tiktokHighIntentComment,
  IntegrationJobAction.adsAutomaticEvent,
  IntegrationJobAction.whatsappIdentityChange,
  IntegrationJobAction.whatsappCallEvent,
  IntegrationJobAction.coexistWhatsappBuffer,
])

export function isChannelOriginatedJob(jobData: IntegrationJobData): boolean {
  return (
    CHANNEL_ORIGINATED_JOB_TYPES.has(jobData.type) ||
    (jobData.type === IntegrationJobAction.sendFlow &&
      jobData.data.origin === "channel")
  )
}

export function isInboundWebhookJob(jobData: { type: string }): boolean {
  return INBOUND_WEBHOOK_JOB_TYPES.has(jobData.type)
}
