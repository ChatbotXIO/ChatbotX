import {
  and,
  db,
  eq,
  isDatabaseError,
  notInArray,
} from "@chatbotx.io/database/client"
import {
  integrationMetaCatalogModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { BaseService } from "../base.service"
import {
  ChatbotXException,
  notFoundException,
  toPublicErrorMessage,
} from "../errors"

const GENERIC_IMPORT_FAILURE =
  "Meta Catalog import failed. Please try again or contact support."
const WORKSPACE_UNIQUE_CONSTRAINT = "IntegrationMetaCatalog_workspaceId_key"
const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/
const TRAILING_SLASH_REGEX = /\/$/
const IMPORT_COMPLETION_RULES = [
  {
    matches: (counts: { imported: number; failed: number }) =>
      counts.failed === 0,
    status: "succeeded",
  },
  {
    matches: (counts: { imported: number; failed: number }) =>
      counts.imported > 0,
    status: "partial",
  },
] as const

const resolveImportCompletionStatus = (counts: {
  imported: number
  failed: number
}) =>
  IMPORT_COMPLETION_RULES.find((rule) => rule.matches(counts))?.status ??
  ("failed" as const)

export const metaCatalogStoredAuthSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
  version: z.string().optional(),
})
export type MetaCatalogStoredAuth = z.infer<typeof metaCatalogStoredAuthSchema>

const isWorkspaceUniqueViolation = (error: unknown): boolean =>
  isDatabaseError(error) &&
  error.cause.code === "23505" &&
  "constraint" in error.cause &&
  error.cause.constraint === WORKSPACE_UNIQUE_CONSTRAINT

class IntegrationMetaCatalogService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationMetaCatalogModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const connection = await this.findByWorkspaceId(workspaceId)
    if (!connection) {
      throw notFoundException("Meta Catalog integration not found")
    }
    return connection
  }

  async upsert(input: {
    workspaceId: string
    auth: MetaCatalogStoredAuth
    tokenExpiresAt: Date | null
  }) {
    const encryptedAuth = await encryptUtils.encryptObject(input.auth)
    const values = {
      encryptedAuth,
      tokenExpiresAt: input.tokenExpiresAt,
      status: "active" as const,
      authMode: "oauth" as const,
    }

    const updateExisting = async () => {
      const existing = await this.findByWorkspaceId(input.workspaceId)
      if (!existing) {
        return
      }
      await db
        .update(integrationMetaCatalogModel)
        .set(values)
        .where(eq(integrationMetaCatalogModel.id, existing.id))
      return existing.id
    }

    const existingId = await updateExisting()
    if (existingId) {
      return existingId
    }

    const integrationId = createId()
    const connectionId = createId()
    try {
      await db.transaction(async (tx) => {
        await tx.insert(integrationModel).values({
          id: integrationId,
          workspaceId: input.workspaceId,
          integrationType: "metaCatalog",
        })
        await tx.insert(integrationMetaCatalogModel).values({
          id: connectionId,
          integrationId,
          workspaceId: input.workspaceId,
          ...values,
        })
      })
      return connectionId
    } catch (error) {
      if (!isWorkspaceUniqueViolation(error)) {
        throw error
      }
      const winnerId = await updateExisting()
      if (!winnerId) {
        throw error
      }
      return winnerId
    }
  }

  async resolveToken(connectionId: string): Promise<string> {
    const row = await db.query.integrationMetaCatalogModel.findFirst({
      where: { id: connectionId },
      columns: { encryptedAuth: true, status: true },
    })
    if (!row) {
      throw notFoundException("Meta Catalog integration not found")
    }
    if (row.status === "invalid") {
      throw new ChatbotXException(
        "Meta Catalog connection requires reconnection",
        "metaCatalogReconnectRequired",
      )
    }
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.encryptedAuth),
      metaCatalogStoredAuthSchema,
    )
    return auth.accessToken
  }

  async resolveAuth(connectionId: string): Promise<MetaCatalogStoredAuth> {
    const row = await db.query.integrationMetaCatalogModel.findFirst({
      where: { id: connectionId },
      columns: { encryptedAuth: true },
    })
    if (!row) {
      throw notFoundException("Meta Catalog integration not found")
    }
    return await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.encryptedAuth),
      metaCatalogStoredAuthSchema,
    )
  }

  async selectCatalog(input: {
    workspaceId: string
    catalogId: string
    catalogName?: string
    businessId?: string
  }) {
    const [row] = await db
      .update(integrationMetaCatalogModel)
      .set({
        catalogId: input.catalogId,
        catalogName: input.catalogName,
        businessId: input.businessId,
        importStatus: "queued",
        importTotalCount: 0,
        importedCount: 0,
        importFailedCount: 0,
        importError: null,
      })
      .where(
        and(
          eq(integrationMetaCatalogModel.workspaceId, input.workspaceId),
          notInArray(integrationMetaCatalogModel.importStatus, [
            "queued",
            "running",
          ]),
        ),
      )
      .returning()
    if (!row) {
      const existing = await this.findByWorkspaceId(input.workspaceId)
      if (existing && ["queued", "running"].includes(existing.importStatus)) {
        throw new ChatbotXException(
          "A Meta Catalog product import is already running",
          "metaCatalogImportAlreadyRunning",
        )
      }
      throw notFoundException("Meta Catalog integration not found")
    }
    return row
  }

  /**
   * Points the connection at a catalog without touching import state. Pushing
   * products up and pulling them down are separate intents, so binding a
   * catalog from the sync tab must not queue an import or reset its counters —
   * that is what {@link selectCatalog} is for.
   */
  async bindCatalog(input: {
    workspaceId: string
    catalogId: string
    catalogName?: string
    businessId?: string
  }) {
    const [row] = await db
      .update(integrationMetaCatalogModel)
      .set({
        catalogId: input.catalogId,
        catalogName: input.catalogName,
        businessId: input.businessId,
      })
      .where(eq(integrationMetaCatalogModel.workspaceId, input.workspaceId))
      .returning()
    if (!row) {
      throw notFoundException("Meta Catalog integration not found")
    }
    return row
  }

  async claimImport(connectionId: string) {
    const [row] = await db
      .update(integrationMetaCatalogModel)
      .set({ importStatus: "running" })
      .where(
        and(
          eq(integrationMetaCatalogModel.id, connectionId),
          eq(integrationMetaCatalogModel.importStatus, "queued"),
        ),
      )
      .returning()
    return row
  }

  async updateImportProgress(input: {
    connectionId: string
    totalCount: number
    importedCount: number
    failedCount: number
  }) {
    await db
      .update(integrationMetaCatalogModel)
      .set({
        importTotalCount: input.totalCount,
        importedCount: input.importedCount,
        importFailedCount: input.failedCount,
      })
      .where(eq(integrationMetaCatalogModel.id, input.connectionId))
  }

  async completeImport(input: {
    connectionId: string
    totalCount: number
    importedCount: number
    failedCount: number
    error?: string
  }) {
    const importStatus = resolveImportCompletionStatus({
      imported: input.importedCount,
      failed: input.failedCount,
    })
    await db
      .update(integrationMetaCatalogModel)
      .set({
        importStatus,
        importTotalCount: input.totalCount,
        importedCount: input.importedCount,
        importFailedCount: input.failedCount,
        importError: input.error ?? null,
        lastImportedAt: new Date(),
      })
      .where(eq(integrationMetaCatalogModel.id, input.connectionId))
  }

  /**
   * `importError` is shown to the workspace, so it is scrubbed here rather than
   * at each call site — a raw driver message would leak the failing SQL. Takes
   * the thrown value so a channel error's user-facing detail survives.
   */
  async failImport(connectionId: string, error: unknown) {
    await db
      .update(integrationMetaCatalogModel)
      .set({
        importStatus: "failed",
        importError: toPublicErrorMessage(error, GENERIC_IMPORT_FAILURE),
        lastImportedAt: new Date(),
      })
      .where(eq(integrationMetaCatalogModel.id, connectionId))
  }

  async saveSettings(input: {
    workspaceId: string
    currency: string
    storeUrl: string
  }) {
    const currency = input.currency.trim().toUpperCase()
    if (!CURRENCY_CODE_REGEX.test(currency)) {
      throw new ChatbotXException(
        "Currency must be a three-letter ISO code",
        "metaCatalogInvalidCurrency",
      )
    }
    let storeUrl: URL
    try {
      storeUrl = new URL(input.storeUrl)
    } catch {
      throw new ChatbotXException(
        "Store URL is invalid",
        "metaCatalogInvalidStoreUrl",
      )
    }
    if (!["http:", "https:"].includes(storeUrl.protocol)) {
      throw new ChatbotXException(
        "Store URL must use HTTP or HTTPS",
        "metaCatalogInvalidStoreUrl",
      )
    }
    const [row] = await db
      .update(integrationMetaCatalogModel)
      .set({
        currency,
        storeUrl: storeUrl.toString().replace(TRAILING_SLASH_REGEX, ""),
      })
      .where(eq(integrationMetaCatalogModel.workspaceId, input.workspaceId))
      .returning()
    if (!row) {
      throw notFoundException("Meta Catalog integration not found")
    }
    return row
  }

  async markInvalid(workspaceId: string) {
    await db
      .update(integrationMetaCatalogModel)
      .set({ status: "invalid" })
      .where(eq(integrationMetaCatalogModel.workspaceId, workspaceId))
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(integrationMetaCatalogModel)
        .where(eq(integrationMetaCatalogModel.id, existing.id))
      await tx
        .delete(integrationModel)
        .where(eq(integrationModel.id, existing.integrationId))
    })
  }
}

export const integrationMetaCatalogService = new IntegrationMetaCatalogService()
