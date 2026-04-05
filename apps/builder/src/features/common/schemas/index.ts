import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const workspaceIdrequestParams: [z.ZodString] = [
  zodBigintAsString().describe("workspaceId"),
]
export type ChatbotIdRequestParams = [string]

export const workspaceIdAndIdRequestParams: [z.ZodString, z.ZodString] = [
  zodBigintAsString().describe("workspaceId"),
  zodBigintAsString().describe("id"),
]
export type WorkspaceIdAndIdRequestParams = [string, string]

export const bulkUpdateIdsRequest = z.object({
  ids: z.array(zodBigintAsString()),
})
export type BulkUpdateIdsRequest = z.infer<typeof bulkUpdateIdsRequest>
