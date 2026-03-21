import { db } from "@chatbotx.io/database/client"
import { auditLogModel } from "@chatbotx.io/database/schema"
import type { JobSendAuditLog } from "@chatbotx.io/worker-config"
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
