import { SYSTEM_ACTOR } from "@chatbotx.io/business/audit"
import { db } from "@chatbotx.io/database/client"
import { auditLogModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type { JobSendAuditLog } from "@chatbotx.io/worker-config"
import { env } from "../../env"

export const sendAuditLog = async (data: JobSendAuditLog["data"]) => {
  if (env.NEXT_PUBLIC_EDITION === "community") {
    return
  }
  const { userId, workspaceId, action, detail, ipAddress, userAgent, source } =
    data
  const persistedUserId = userId === SYSTEM_ACTOR ? null : userId
  await db
    .insert(auditLogModel)
    .values({
      id: data.auditLogId ?? createId(),
      userId: persistedUserId,
      workspaceId,
      action,
      detail,
      ipAddress,
      userAgent,
      source,
    })
    .onConflictDoNothing()
}
