import {
  and,
  count,
  db,
  desc,
  eq,
  ilike,
  type SQL,
} from "@chatbotx.io/database/client"
import type { ImportStatus, ImportType } from "@chatbotx.io/database/partials"
import { fileModel, importModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderBy,
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

  const keyword = input.keyword?.trim()

  const conditions: SQL[] = [eq(importModel.workspaceId, input.workspaceId)]
  if (input.type) {
    conditions.push(eq(importModel.type, input.type))
  }
  if (input.status) {
    conditions.push(eq(importModel.status, input.status))
  }
  if (keyword) {
    conditions.push(ilike(fileModel.fileName, `%${keyword}%`))
  }
  const where = and(...conditions)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderBy(importModel, {
    sort: input.sort ?? undefined,
  })
  const finalOrderBy = orderBy.length ? orderBy : [desc(importModel.createdAt)]

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: importModel.id,
        workspaceId: importModel.workspaceId,
        userId: importModel.userId,
        fileId: importModel.fileId,
        fileName: fileModel.fileName,
        type: importModel.type,
        status: importModel.status,
        totalCount: importModel.totalCount,
        processedCount: importModel.processedCount,
        successCount: importModel.successCount,
        failedCount: importModel.failedCount,
        errorMessage: importModel.errorMessage,
        completedAt: importModel.completedAt,
        createdAt: importModel.createdAt,
        updatedAt: importModel.updatedAt,
      })
      .from(importModel)
      .innerJoin(fileModel, eq(importModel.fileId, fileModel.id))
      .where(where)
      .orderBy(...finalOrderBy)
      .limit(pagination.limit)
      .offset(pagination.offset),
    db
      .select({ value: count() })
      .from(importModel)
      .innerJoin(fileModel, eq(importModel.fileId, fileModel.id))
      .where(where),
  ])

  const totalRows = totalResult[0]?.value ?? 0

  const data: ListImportsItem[] = rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    fileId: row.fileId,
    fileName: row.fileName,
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
