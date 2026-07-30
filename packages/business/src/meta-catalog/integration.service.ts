import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isDatabaseError,
  isNull,
  notInArray,
} from "@chatbotx.io/database/client"
import {
  integrationMetaCatalogModel,
  integrationModel,
  metaCatalogSyncRunModel,
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
import { resolveMetaCatalogOutcome } from "./outcome-status"

const GENERIC_IMPORT_FAILURE =
  "Meta Catalog import failed. Please try again or contact support."
const WORKSPACE_UNIQUE_CONSTRAINT = "IntegrationMetaCatalog_workspaceId_key"
const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/
const TRAILING_SLASH_REGEX = /\/$/
const ACTIVE_IMPORT_STATUSES = ["queued", "running"] as const

const toPublicMetaCatalogImportMessage = (message: string) =>
  toPublicErrorMessage(
    new ChatbotXException(message, "metaCatalogPublicError"),
    GENERIC_IMPORT_FAILURE,
  )

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
  findByWorkspaceId(workspaceId: string, tx: DatabaseClient = db) {
    return tx.query.integrationMetaCatalogModel.findFirst({
      where: { workspaceId, deletedAt: { isNull: true } },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string, tx: DatabaseClient = db) {
    const connection = await this.findByWorkspaceId(workspaceId, tx)
    if (!connection) {
      throw notFoundException("Meta Catalog integration not found")
    }
    return connection
  }

  /**
   * Serializes connection lifecycle transitions. Starting a run and
   * disconnecting take this same row lock, so neither can observe a connection
   * halfway through the other's state transition.
   */
  async lockByWorkspaceIdOrFail(workspaceId: string, tx: DatabaseClient) {
    const [connection] = await tx
      .select()
      .from(integrationMetaCatalogModel)
      .where(
        and(
          eq(integrationMetaCatalogModel.workspaceId, workspaceId),
          isNull(integrationMetaCatalogModel.deletedAt),
        ),
      )
      .for("update")
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
      deletedAt: null,
    }

    const updateExisting = async () => {
      return await db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            id: integrationMetaCatalogModel.id,
            deletedAt: integrationMetaCatalogModel.deletedAt,
          })
          .from(integrationMetaCatalogModel)
          .where(eq(integrationMetaCatalogModel.workspaceId, input.workspaceId))
          .for("update")
        if (!current) {
          return
        }
        let hasActiveRun = false
        if (current.deletedAt) {
          const [activeRun] = await tx
            .select({ id: metaCatalogSyncRunModel.id })
            .from(metaCatalogSyncRunModel)
            .where(
              and(
                eq(metaCatalogSyncRunModel.workspaceId, input.workspaceId),
                inArray(metaCatalogSyncRunModel.status, ["queued", "running"]),
              ),
            )
            .limit(1)
          hasActiveRun = Boolean(activeRun)
        }
        const [existing] = await tx
          .update(integrationMetaCatalogModel)
          .set({
            ...values,
            // Preserve an active run's import flag so its worker can finish
            // against the revived connection. Reset only a genuinely idle
            // deleted session; terminalizing a live run here could orphan
            // already accepted Meta batch handles.
            ...(current.deletedAt && !hasActiveRun
              ? { importStatus: "idle" as const, importError: null }
              : {}),
          })
          .where(eq(integrationMetaCatalogModel.id, current.id))
          .returning({ id: integrationMetaCatalogModel.id })
        return existing?.id
      })
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

  /**
   * The stored credentials, refusing a connection Meta has already rejected.
   *
   * Returns the whole record rather than just the token because every Graph call
   * needs both the token and the version it was issued against — asking for them
   * separately meant reading the row twice and decrypting the same blob twice.
   */
  async resolveAuth(connectionId: string): Promise<MetaCatalogStoredAuth> {
    const row = await db.query.integrationMetaCatalogModel.findFirst({
      where: { id: connectionId, deletedAt: { isNull: true } },
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
    if (!row.encryptedAuth) {
      throw new ChatbotXException(
        "Meta Catalog connection requires reconnection",
        "metaCatalogReconnectRequired",
      )
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
    tx?: DatabaseClient
  }) {
    const { tx = db } = input
    const [row] = await tx
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
          isNull(integrationMetaCatalogModel.deletedAt),
          notInArray(integrationMetaCatalogModel.importStatus, [
            "queued",
            "running",
          ]),
        ),
      )
      .returning()
    if (!row) {
      const existing = await this.findByWorkspaceId(input.workspaceId, tx)
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
    tx?: DatabaseClient
  }) {
    const { tx = db } = input
    const [row] = await tx
      .update(integrationMetaCatalogModel)
      .set({
        catalogId: input.catalogId,
        catalogName: input.catalogName,
        businessId: input.businessId,
      })
      .where(
        and(
          eq(integrationMetaCatalogModel.workspaceId, input.workspaceId),
          isNull(integrationMetaCatalogModel.deletedAt),
        ),
      )
      .returning()
    if (!row) {
      throw notFoundException("Meta Catalog integration not found")
    }
    return row
  }

  async claimImport(input: { connectionId: string; workspaceId: string }) {
    const [row] = await db
      .update(integrationMetaCatalogModel)
      .set({ importStatus: "running" })
      .where(
        and(
          eq(integrationMetaCatalogModel.id, input.connectionId),
          eq(integrationMetaCatalogModel.workspaceId, input.workspaceId),
          isNull(integrationMetaCatalogModel.deletedAt),
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
      .where(
        and(
          eq(integrationMetaCatalogModel.id, input.connectionId),
          isNull(integrationMetaCatalogModel.deletedAt),
          eq(integrationMetaCatalogModel.importStatus, "running"),
        ),
      )
  }

  async completeImport(input: {
    connectionId: string
    totalCount: number
    importedCount: number
    failedCount: number
    error?: string
  }) {
    const importStatus = resolveMetaCatalogOutcome({
      succeededCount: input.importedCount,
      failedCount: input.failedCount,
    })
    await db
      .update(integrationMetaCatalogModel)
      .set({
        importStatus,
        importTotalCount: input.totalCount,
        importedCount: input.importedCount,
        importFailedCount: input.failedCount,
        importError: input.error
          ? toPublicMetaCatalogImportMessage(input.error)
          : null,
        lastImportedAt: new Date(),
      })
      .where(
        and(
          eq(integrationMetaCatalogModel.id, input.connectionId),
          isNull(integrationMetaCatalogModel.deletedAt),
          eq(integrationMetaCatalogModel.importStatus, "running"),
        ),
      )
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
      .where(
        and(
          eq(integrationMetaCatalogModel.id, connectionId),
          isNull(integrationMetaCatalogModel.deletedAt),
          inArray(integrationMetaCatalogModel.importStatus, [
            "queued",
            "running",
          ]),
        ),
      )
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
      .where(
        and(
          eq(integrationMetaCatalogModel.workspaceId, input.workspaceId),
          isNull(integrationMetaCatalogModel.deletedAt),
        ),
      )
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
      .where(
        and(
          eq(integrationMetaCatalogModel.workspaceId, workspaceId),
          isNull(integrationMetaCatalogModel.deletedAt),
        ),
      )
  }

  async disconnect(workspaceId: string) {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(integrationMetaCatalogModel)
        .where(
          and(
            eq(integrationMetaCatalogModel.workspaceId, workspaceId),
            isNull(integrationMetaCatalogModel.deletedAt),
          ),
        )
        .for("update")
      if (!existing) {
        return
      }
      const [activeRun] = await tx
        .select({ id: metaCatalogSyncRunModel.id })
        .from(metaCatalogSyncRunModel)
        .where(
          and(
            eq(metaCatalogSyncRunModel.workspaceId, workspaceId),
            inArray(metaCatalogSyncRunModel.status, ["queued", "running"]),
          ),
        )
        .limit(1)
      if (
        activeRun ||
        ACTIVE_IMPORT_STATUSES.includes(
          existing.importStatus as (typeof ACTIVE_IMPORT_STATUSES)[number],
        )
      ) {
        throw new ChatbotXException(
          "Wait for the active Meta Catalog sync to finish before disconnecting",
          "metaCatalogSyncAlreadyRunning",
        )
      }
      await tx
        .update(integrationMetaCatalogModel)
        .set({
          deletedAt: new Date(),
          encryptedAuth: null,
          tokenExpiresAt: null,
          status: "invalid",
          importStatus: "failed",
          importError: "Meta Catalog was disconnected",
        })
        .where(
          and(
            eq(integrationMetaCatalogModel.id, existing.id),
            isNull(integrationMetaCatalogModel.deletedAt),
          ),
        )
    })
  }
}

export const integrationMetaCatalogService = new IntegrationMetaCatalogService()
