import { importStatuses } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"

export const contactImportPublicResource = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  fileId: z.string(),
  fileName: z.string(),
  type: z.literal("contacts"),
  status: importStatuses,
  totalCount: z.number(),
  processedCount: z.number(),
  successCount: z.number(),
  failedCount: z.number(),
  errorMessage: z.string().nullable(),
  errorSample: z.array(
    z.object({
      row: z.number(),
      reason: z.string(),
    }),
  ),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const listContactImportsPublicRequest = publicListRequest.extend({
  status: importStatuses.optional(),
  keyword: z.string().nullish(),
})

export const listContactImportsPublicResponse = publicListResponse(
  contactImportPublicResource,
)

export const getContactImportPublicRequest = z.object({
  id: z.string(),
})
