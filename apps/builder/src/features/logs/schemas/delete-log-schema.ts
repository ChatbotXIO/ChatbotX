import { LogType } from "@aha.chat/database/types"
import { z } from "zod"
import { bulkUpdateIdsRequest } from "@/features/common/schemas"

export const deleteLogsRequest = bulkUpdateIdsRequest.extend({
  logType: z.nativeEnum(LogType),
})
export type DeleteLogsRequest = z.infer<typeof deleteLogsRequest>
