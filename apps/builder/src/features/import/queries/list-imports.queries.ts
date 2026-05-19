import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import type { ImportStatus, ImportType } from "@chatbotx.io/database/partials"
import { importModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListImportsItem,
  ListImportsRequest,
  ListImportsResponse,
} from "../schemas/query"

export async function listImports(
  input: ListImportsRequest & { workspaceId: string },
): Promise<ListImportsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    ...(input.type ? { type: input.type } : {}),
    ...(input.status ? { status: input.status } : {}),
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(importModel, input)

  const [rows, totalRows] = await Promise.all([
    db.query.importModel.findMany({
      where,
      ...pagination,
      orderBy: Object.keys(orderBy).length ? orderBy : { createdAt: "desc" },
      with: { file: { columns: { fileName: true } } },
    }),
    db.$count(
      importModel,
      // biome-ignore lint/suspicious/noExplicitAny: relationsFilterToSQL requires typed Drizzle filter
      relationsFilterToSQL(importModel, where as any),
    ),
  ])

  const data: ListImportsItem[] = rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    fileId: row.fileId,
    fileName: row.file?.fileName ?? "",
    type: row.type as ImportType,
    status: row.status as ImportStatus,
    totalCount: row.totalCount,
    processedCount: row.processedCount,
    successCount: row.successCount,
    failedCount: row.failedCount,
    errorMessage: row.errorMessage,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}
