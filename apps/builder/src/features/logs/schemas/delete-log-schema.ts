import { bulkUpdateIdsRequest } from "@/features/common/schemas"
import { LogType } from "@ahachat.ai/database/types"
import { z } from "zod"

export const deleteLogsRequest = bulkUpdateIdsRequest.extend({
  logType: z.nativeEnum(LogType),
})
export type DeleteLogsRequest = z.infer<typeof deleteLogsRequest>
