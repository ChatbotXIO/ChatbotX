import { db } from "@aha.chat/database/client"
import { auditLogModel } from "@aha.chat/database/schema"
import type { JobSendAuditLog } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { env } from "../../env"

export const sendAuditLog = async (data: JobSendAuditLog["data"]) => {
  if (env.NEXT_PUBLIC_EDITION === "community") {
    return
  }
  const { userId, chatbotId, action, detail } = data
  await db.insert(auditLogModel).values({
    id: createId(),
    userId,
    chatbotId,
    action,
    detail,
  })
}
