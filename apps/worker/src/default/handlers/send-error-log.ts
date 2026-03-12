import { db } from "@aha.chat/database/client"
import { errorLogModel } from "@aha.chat/database/schema"
import type { JobSendErrorLog } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"

export const sendErrorLog = async (data: JobSendErrorLog["data"]) => {
  const { chatbotId, error } = data
  await db.insert(errorLogModel).values({
    id: createId(),
    chatbotId,
    action: error.message ?? "Unknown error",
    detail: error.stack ?? "",
    httpCode: "500",
  })
}
