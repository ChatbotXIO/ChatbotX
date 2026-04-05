import { db } from "@chatbotx.io/database/client"
import { auditLogModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type { JobSendAuditLog } from "@chatbotx.io/worker-config"
import { env } from "../../env"

export const sendAuditLog = async (data: JobSendAuditLog["data"]) => {
  if (env.NEXT_PUBLIC_EDITION === "community") {
    return
  }
  const { userId, workspaceId, action, detail } = data
  await db.insert(auditLogModel).values({
    id: createId(),
    userId,
    workspaceId,
    action,
    detail,
  })
}
