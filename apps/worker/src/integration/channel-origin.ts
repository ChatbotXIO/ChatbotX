import {
  IntegrationJobAction,
  type IntegrationJobData,
} from "@chatbotx.io/worker-config"

const CHANNEL_ORIGINATED_JOB_TYPES: ReadonlySet<string> = new Set([
  IntegrationJobAction.incomingMessage,
  IntegrationJobAction.incomingMessageEcho,
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
  IntegrationJobAction.contactMarkAsRead,
  IntegrationJobAction.channelAudienceEvent,
  IntegrationJobAction.messageReaction,
  IntegrationJobAction.messageStatus,
  IntegrationJobAction.deleteIncomingMessage,
  IntegrationJobAction.updateIncomingComment,
  IntegrationJobAction.deleteIncomingComment,
  IntegrationJobAction.processLeadgen,
  IntegrationJobAction.processMarketingMessageWebhook,
  IntegrationJobAction.tiktokHighIntentComment,
  IntegrationJobAction.adsAutomaticEvent,
  IntegrationJobAction.providerAccountEvent,
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

export function isInboundWebhookJob(jobData: IntegrationJobData): boolean {
  return (
    INBOUND_WEBHOOK_JOB_TYPES.has(jobData.type) ||
    isChannelOriginatedJob(jobData)
  )
}
