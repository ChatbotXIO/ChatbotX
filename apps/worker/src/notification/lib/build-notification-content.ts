import type { ContentType } from "@chatbotx.io/database/partials"
import type { NotificationJobData } from "@chatbotx.io/worker-config"
import { t } from "./strings"

export type NotificationContent = {
  title: string
  body: string
}

const resolveIncomingMessageBody = (
  strings: ReturnType<typeof t>,
  data: {
    messageText?: string
    contentType?: ContentType
    attachmentCount?: number
  },
): string => {
  if (data.messageText) {
    return data.messageText
  }
  if (data.contentType === "location") {
    return strings.sharedLocation
  }
  if (data.contentType === "refLink") {
    return strings.sentLink
  }
  if (data.attachmentCount === 1) {
    return strings.sentAttachment
  }
  if (data.attachmentCount && data.attachmentCount > 1) {
    return strings.sentAttachments(data.attachmentCount)
  }
  return ""
}

export const buildNotificationContent = (props: {
  job: NotificationJobData
  contactFullName: string | null | undefined
  workspaceLanguage: string | undefined
}): NotificationContent => {
  const { job, contactFullName, workspaceLanguage } = props
  const strings = t(workspaceLanguage)

  if (job.type === "notifyConversationAssigned") {
    return {
      title: contactFullName ?? strings.newMessage,
      body: strings.assignedConversation,
    }
  }

  return {
    title: contactFullName ?? strings.newMessage,
    body: resolveIncomingMessageBody(strings, job.data),
  }
}
