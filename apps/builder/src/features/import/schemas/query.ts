import {
  type ImportStatus,
  type ImportType,
  importStatuses,
  importTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type z from "zod"
import { basePaginationRequest } from "@/lib/pagination"

export const listImportsRequest = basePaginationRequest.extend({
  workspaceId: zodBigintAsString(),
  type: importTypes.optional(),
  status: importStatuses.optional(),
})
export type ListImportsRequest = z.infer<typeof listImportsRequest>

export type ListImportsItem = {
  id: string
  workspaceId: string
  userId: string | null
  fileId: string
  fileName: string
  type: ImportType
  status: ImportStatus
  totalCount: number
  processedCount: number
  successCount: number
  failedCount: number
  errorMessage: string | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ListImportsResponse = {
  data: ListImportsItem[]
  pageCount: number
}
