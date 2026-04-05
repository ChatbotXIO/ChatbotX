import { db } from "@chatbotx.io/database/client"
import { errorLogModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type { JobSendErrorLog } from "@chatbotx.io/worker-config"

export const sendErrorLog = async (data: JobSendErrorLog["data"]) => {
  const { workspaceId, error } = data
  await db.insert(errorLogModel).values({
    id: createId(),
    workspaceId,
    action: error.message ?? "Unknown error",
    detail: error.stack ?? "",
    httpCode: "500",
  })
}
