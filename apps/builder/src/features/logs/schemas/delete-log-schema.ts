import { bulkUpdateIdsRequest } from "@/features/common/schemas"
import { LogType } from "@aha.chat/database/types"
import { z } from "zod"

export const deleteLogsRequest = bulkUpdateIdsRequest.extend({
  logType: z.nativeEnum(LogType),
})
export type DeleteLogsRequest = z.infer<typeof deleteLogsRequest>
