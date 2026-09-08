import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const getExportFilePublicRequest = z.object({
  fileId: zodBigintAsString(),
})

export const getExportFilePublicResponse = z.object({
  status: z.enum(["pending", "uploaded", "failed"]),
  fileName: z.string(),
  downloadUrl: z.string().nullable(),
  totalRecords: z.number().nullable(),
})
export type GetExportFilePublicResponse = z.infer<
  typeof getExportFilePublicResponse
>
