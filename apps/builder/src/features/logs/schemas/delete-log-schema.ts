import { logType } from "@aha.chat/database/schema"
import { z } from "zod"
import { bulkUpdateIdsRequest } from "@/features/common/schemas"

export const deleteLogsRequest = bulkUpdateIdsRequest.extend({
  logType: z.enum(logType.enumValues),
})
export type DeleteLogsRequest = z.infer<typeof deleteLogsRequest>
