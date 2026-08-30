import { createSelectSchema, errorLogModel } from "@chatbotx.io/database/schema"
import { z } from "zod"
import { basePaginationInput } from "../shared/pagination"

export const publicErrorLogResource = createSelectSchema(errorLogModel, {
  id: z.string(),
  workspaceId: z.string(),
  contactId: z.string().nullable(),
})
export type PublicErrorLogResource = z.infer<typeof publicErrorLogResource>

export const listErrorLogsInput = basePaginationInput.extend({
  keyword: z.string().optional(),
})
export type ListErrorLogsInput = z.infer<typeof listErrorLogsInput>

export const publicListErrorLogsResponse = z.object({
  data: z.array(publicErrorLogResource),
  pageCount: z.number(),
})
export type PublicListErrorLogsResponse = z.infer<
  typeof publicListErrorLogsResponse
>
