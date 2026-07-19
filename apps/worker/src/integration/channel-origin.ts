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
])

export function isChannelOriginatedJob(jobData: IntegrationJobData): boolean {
  return (
    CHANNEL_ORIGINATED_JOB_TYPES.has(jobData.type) ||
    (jobData.type === IntegrationJobAction.sendFlow &&
      jobData.data.origin === "channel")
  )
}
