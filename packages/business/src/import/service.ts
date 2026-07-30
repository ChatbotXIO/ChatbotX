import {
  and,
  count,
  db,
  desc,
  eq,
  ilike,
  isDatabaseError,
  type SQL,
} from "@chatbotx.io/database/client"
import {
  fileStatuses,
  type ImportFormat,
  type ImportStatus,
  type ImportType,
  importStatuses,
} from "@chatbotx.io/database/partials"
import { fileModel, importModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderBy,
} from "@chatbotx.io/database/utils"
import { resolveImportFileFormat } from "@chatbotx.io/imports/file-validation"
import { getImportEntry } from "@chatbotx.io/imports/registry"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, toPublicErrorMessage } from "../errors"

const GENERIC_IMPORT_FAILURE =
  "The import failed. Please try again or contact support."

export type ImportErrorSample = { row: number; reason: string }
export type ImportCounters = {
  processed: number
  success: number
  failed: number
}

const ACTIVE_PRODUCT_IMPORT_CONSTRAINT = "Import_products_active_idx"

const isActiveProductImportViolation = (error: unknown): boolean =>
  isDatabaseError(error) &&
  error.cause.code === "23505" &&
  "constraint" in error.cause &&
  error.cause.constraint === ACTIVE_PRODUCT_IMPORT_CONSTRAINT

class ImportService extends BaseService {
  async findForWorker(importId: string) {
    return await db.query.importModel.findFirst({
      where: { id: importId },
      with: { file: true },
    })
  }

  async findFile(input: { workspaceId: string; fileId: string }) {
    return await db.query.fileModel.findFirst({
      where: {
        id: input.fileId,
        workspaceId: input.workspaceId,
        contextType: "import",
      },
    })
  }

  async startProductImport(input: {
    workspaceId: string
    userId: string | null
    fileId: string
    format: Extract<ImportFormat, "csv" | "xlsx">
    meta: typeof importModel.$inferInsert.meta
  }) {
    const file = await this.findFile(input)
    if (!file) {
      throw new ChatbotXException(
        "Product import file not found",
        "productImportFileNotFound",
      )
    }
    const config = getImportEntry("products").config
    const fileFormat = resolveImportFileFormat(config, file)
    if (file.subType !== "products" || !fileFormat) {
      throw new ChatbotXException(
        "Product import file type is invalid",
        "productImportFileTypeInvalid",
      )
    }
    if (fileFormat !== input.format) {
      throw new ChatbotXException(
        "Product import format does not match the uploaded file",
        "productImportFormatMismatch",
      )
    }
    const active = await db.query.importModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        type: "products",
        status: { in: ["pending", "processing"] },
      },
      columns: { id: true },
    })
    if (active) {
      throw new ChatbotXException(
        "A product import is already running",
        "productImportAlreadyRunning",
      )
    }

    try {
      return await db.transaction(async (tx) => {
        await tx
          .update(fileModel)
          .set({
            status: fileStatuses.enum.uploaded,
            uploadedAt: new Date(),
          })
          .where(
            and(
              eq(fileModel.id, input.fileId),
              eq(fileModel.workspaceId, input.workspaceId),
            ),
          )
        const [row] = await tx
          .insert(importModel)
          .values({
            id: createId(),
            workspaceId: input.workspaceId,
            userId: input.userId,
            fileId: input.fileId,
            type: "products",
            format: input.format,
            status: importStatuses.enum.pending,
            meta: input.meta,
          })
          .returning()
        if (!row) {
          throw new Error("Failed to start product import")
        }
        return row
      })
    } catch (error) {
      if (isActiveProductImportViolation(error)) {
        throw new ChatbotXException(
          "A product import is already running",
          "productImportAlreadyRunning",
        )
      }
      throw error
    }
  }

  async markProcessing(importId: string) {
    await db
      .update(importModel)
      .set({ status: importStatuses.enum.processing })
      .where(eq(importModel.id, importId))
  }

  async fail(
    importId: string,
    /**
     * The thrown value, not a pre-extracted message — a channel error keeps its
     * user-facing detail on the object, and `.message` alone loses it.
     */
    message: unknown,
    counters?: ImportCounters,
    errorSample?: ImportErrorSample[],
  ) {
    await db
      .update(importModel)
      .set({
        status: importStatuses.enum.failed,
        // Shown in the import history, so a raw driver message — which carries
        // the failing SQL and its bound values — must never reach it.
        errorMessage: toPublicErrorMessage(message, GENERIC_IMPORT_FAILURE),
        completedAt: new Date(),
        totalCount: counters?.processed,
        processedCount: counters?.processed,
        successCount: counters?.success,
        failedCount: counters?.failed,
        errorSample,
      })
      .where(eq(importModel.id, importId))
  }

  async flushProgress(input: {
    importId: string
    counters: ImportCounters
    errorSample?: ImportErrorSample[]
  }) {
    await db
      .update(importModel)
      .set({
        processedCount: input.counters.processed,
        successCount: input.counters.success,
        failedCount: input.counters.failed,
        errorSample: input.errorSample,
      })
      .where(eq(importModel.id, input.importId))
  }

  async complete(input: {
    importId: string
    counters: ImportCounters
    errorSample: ImportErrorSample[]
  }) {
    const hiddenErrorCount = Math.max(
      0,
      input.counters.failed - input.errorSample.length,
    )
    await db
      .update(importModel)
      .set({
        status: importStatuses.enum.completed,
        completedAt: new Date(),
        totalCount: input.counters.processed,
        processedCount: input.counters.processed,
        successCount: input.counters.success,
        failedCount: input.counters.failed,
        errorSample: input.errorSample,
        errorMessage:
          hiddenErrorCount > 0
            ? `${input.counters.failed} rows failed; showing the first ${input.errorSample.length}`
            : null,
      })
      .where(eq(importModel.id, input.importId))
  }

  async list(input: {
    workspaceId: string
    type?: ImportType
    status?: ImportStatus
    keyword?: string | null
    page?: number
    perPage?: number
    sort?: { id: string; desc: boolean }[]
  }) {
    const keyword = input.keyword?.trim()
    const conditions: SQL[] = [eq(importModel.workspaceId, input.workspaceId)]
    if (input.type) {
      conditions.push(eq(importModel.type, input.type))
    }
    if (input.status) {
      conditions.push(eq(importModel.status, input.status))
    }
    if (keyword) {
      conditions.push(ilike(fileModel.fileName, likeContains(keyword)))
    }
    const where = and(...conditions)
    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderBy(importModel, { sort: input.sort })
    const finalOrderBy = orderBy.length
      ? orderBy
      : [desc(importModel.createdAt)]

    const [data, totalResult] = await Promise.all([
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
          errorSample: importModel.errorSample,
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
    return {
      data,
      pageCount: Math.ceil((totalResult[0]?.value ?? 0) / pagination.limit),
    }
  }
}

export const importService = new ImportService()
