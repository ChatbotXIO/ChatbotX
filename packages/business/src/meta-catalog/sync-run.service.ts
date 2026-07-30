import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isDatabaseError,
  isNotNull,
  lt,
  sql,
} from "@chatbotx.io/database/client"
import type {
  MetaCatalogBatchHandle,
  MetaCatalogItemDirection,
  MetaCatalogItemError,
  MetaCatalogSkippedItem,
  MetaCatalogSyncScope,
} from "@chatbotx.io/database/partials"
import {
  metaCatalogItemRepository,
  productCategoryRepository,
  productRepository,
} from "@chatbotx.io/database/repositories"
import { metaCatalogSyncRunModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import {
  ChatbotXException,
  notFoundException,
  toPublicErrorMessage,
} from "../errors"
import { resolveMetaCatalogOutcome } from "./outcome-status"

const ACTIVE_RUN_CONSTRAINT = "MetaCatalogSyncRun_active_idx"
const GENERIC_SYNC_FAILURE =
  "Meta Catalog sync failed. Please try again or contact support."
const MAX_DIAGNOSTIC_ITEMS = 50

const toPublicMetaCatalogMessage = (message: string) =>
  toPublicErrorMessage(
    new ChatbotXException(message, "metaCatalogPublicError"),
    GENERIC_SYNC_FAILURE,
  )

const sanitizeItemErrors = (errors: MetaCatalogItemError[]) =>
  errors.map((item) => ({
    ...item,
    reason: toPublicMetaCatalogMessage(item.reason),
  }))

const isActiveRunViolation = (error: unknown): boolean =>
  isDatabaseError(error) &&
  error.cause.code === "23505" &&
  "constraint" in error.cause &&
  error.cause.constraint === ACTIVE_RUN_CONSTRAINT

class MetaCatalogSyncRunService extends BaseService {
  async create(
    input: {
      workspaceId: string
      integrationMetaCatalogId: string
      scope: MetaCatalogSyncScope
      /** Defaults to a push — pulling from Meta has to say so explicitly. */
      direction?: MetaCatalogItemDirection
      /**
       * The catalog this run works against. Recorded on the run itself so history
       * still names it after the connection is rebound to another catalog.
       */
      catalogId?: string
      categoryId?: string
      selectedProductIds?: string[]
    },
    tx: DatabaseClient = db,
  ) {
    const selectedProductIds =
      input.scope === "selected"
        ? Array.from(new Set(input.selectedProductIds ?? []))
        : []
    if (input.scope === "category" && input.categoryId) {
      const category = await productCategoryRepository.find(
        {
          workspaceId: input.workspaceId,
          categoryId: input.categoryId,
        },
        tx,
      )
      if (!category) {
        throw notFoundException("Product category does not exist.")
      }
    }
    if (selectedProductIds.length) {
      const products = await productRepository.findByIds(
        {
          workspaceId: input.workspaceId,
          productIds: selectedProductIds,
        },
        tx,
      )
      if (products.length !== selectedProductIds.length) {
        throw notFoundException("One or more products do not exist.")
      }
    }
    try {
      const [run] = await tx
        .insert(metaCatalogSyncRunModel)
        .values({
          id: createId(),
          workspaceId: input.workspaceId,
          integrationMetaCatalogId: input.integrationMetaCatalogId,
          scope: input.scope,
          direction: input.direction ?? "push",
          catalogId: input.catalogId,
          categoryId: input.scope === "category" ? input.categoryId : undefined,
          selectedProductIds,
        })
        .returning()
      if (!run) {
        throw new Error("Failed to create Meta Catalog sync run")
      }
      return run
    } catch (error) {
      if (isActiveRunViolation(error)) {
        throw new ChatbotXException(
          "A Meta Catalog sync is already running",
          "metaCatalogSyncAlreadyRunning",
        )
      }
      throw error
    }
  }

  async findById(input: { runId: string; workspaceId: string }) {
    const run = await db.query.metaCatalogSyncRunModel.findFirst({
      where: { id: input.runId, workspaceId: input.workspaceId },
    })
    if (!run) {
      throw notFoundException("Meta Catalog sync run not found")
    }
    return run
  }

  async claim(input: { runId: string; workspaceId: string }) {
    const [run] = await db
      .update(metaCatalogSyncRunModel)
      .set({ status: "running", startedAt: new Date() })
      .where(
        and(
          eq(metaCatalogSyncRunModel.id, input.runId),
          eq(metaCatalogSyncRunModel.workspaceId, input.workspaceId),
          eq(metaCatalogSyncRunModel.status, "queued"),
        ),
      )
      .returning()
    return run
  }

  async claimSubmission(input: { runId: string; workspaceId: string }) {
    const leaseId = createId()
    const [run] = await db
      .update(metaCatalogSyncRunModel)
      .set({
        status: "running",
        startedAt: new Date(),
        submissionLeaseId: leaseId,
      })
      .where(
        and(
          eq(metaCatalogSyncRunModel.id, input.runId),
          eq(metaCatalogSyncRunModel.workspaceId, input.workspaceId),
          eq(metaCatalogSyncRunModel.status, "queued"),
        ),
      )
      .returning()
    return run
  }

  async claimStaleSubmission(input: {
    runId: string
    workspaceId: string
    staleBefore: Date
  }) {
    const leaseId = createId()
    const [run] = await db
      .update(metaCatalogSyncRunModel)
      .set({ submissionLeaseId: leaseId })
      .where(
        and(
          eq(metaCatalogSyncRunModel.id, input.runId),
          eq(metaCatalogSyncRunModel.workspaceId, input.workspaceId),
          eq(metaCatalogSyncRunModel.status, "running"),
          isNotNull(metaCatalogSyncRunModel.submissionLeaseId),
          lt(metaCatalogSyncRunModel.updatedAt, input.staleBefore),
        ),
      )
      .returning()
    return run
  }

  async listRecoverablePushRuns(staleBefore: Date) {
    return await db.query.metaCatalogSyncRunModel.findMany({
      where: {
        direction: "push",
        status: "running",
        updatedAt: { lt: staleBefore },
      },
      columns: {
        id: true,
        workspaceId: true,
        submissionLeaseId: true,
      },
      limit: 100,
    })
  }

  async recordSubmission(input: {
    runId: string
    submissionLeaseId: string
    totalCount: number
    handles: MetaCatalogBatchHandle[]
    skippedItems: MetaCatalogSkippedItem[]
    /**
     * Confirmed failures only. `itemErrors` below may additionally carry
     * provisional "not yet submitted" placeholders for crash recovery — those
     * must never be counted here, or the history view would show a live run
     * as having failed items it merely hasn't gotten to yet.
     */
    failedCount: number
    itemErrors?: MetaCatalogItemError[]
  }) {
    const itemErrors = sanitizeItemErrors(input.itemErrors ?? [])
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ handles: metaCatalogSyncRunModel.handles })
        .from(metaCatalogSyncRunModel)
        .where(
          and(
            eq(metaCatalogSyncRunModel.id, input.runId),
            eq(metaCatalogSyncRunModel.status, "running"),
            eq(
              metaCatalogSyncRunModel.submissionLeaseId,
              input.submissionLeaseId,
            ),
          ),
        )
        .for("update")
      if (!current) {
        return false
      }
      const handlesById = new Map(
        [...current.handles, ...input.handles].map((handle) => [
          handle.handle,
          handle,
        ]),
      )
      await tx
        .update(metaCatalogSyncRunModel)
        .set({
          totalCount: input.totalCount,
          handles: Array.from(handlesById.values()),
          skippedItems: input.skippedItems.slice(0, MAX_DIAGNOSTIC_ITEMS),
          skippedCount: input.skippedItems.length,
          itemErrors: itemErrors.slice(0, MAX_DIAGNOSTIC_ITEMS),
          failedCount: input.failedCount,
        })
        .where(eq(metaCatalogSyncRunModel.id, input.runId))
      return true
    })
  }

  async finishSubmission(runId: string, submissionLeaseId: string) {
    const [run] = await db
      .update(metaCatalogSyncRunModel)
      .set({ submissionLeaseId: null })
      .where(
        and(
          eq(metaCatalogSyncRunModel.id, runId),
          eq(metaCatalogSyncRunModel.status, "running"),
          eq(metaCatalogSyncRunModel.submissionLeaseId, submissionLeaseId),
        ),
      )
      .returning({ id: metaCatalogSyncRunModel.id })
    return Boolean(run)
  }

  async incrementPollAttempt(runId: string) {
    await db
      .update(metaCatalogSyncRunModel)
      .set({
        pollAttempt: sql`${metaCatalogSyncRunModel.pollAttempt} + 1`,
      })
      .where(
        and(
          eq(metaCatalogSyncRunModel.id, runId),
          eq(metaCatalogSyncRunModel.status, "running"),
        ),
      )
  }

  async complete(input: {
    runId: string
    integrationMetaCatalogId: string
    /** The catalog the items actually landed in, not whatever is bound now. */
    catalogId: string
    succeededItems: Array<{
      productId: string
      retailerId: string
      fingerprint: string
    }>
    errors: MetaCatalogItemError[]
  }) {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          skippedCount: metaCatalogSyncRunModel.skippedCount,
          itemErrors: metaCatalogSyncRunModel.itemErrors,
          failedCount: metaCatalogSyncRunModel.failedCount,
        })
        .from(metaCatalogSyncRunModel)
        .where(
          and(
            eq(metaCatalogSyncRunModel.id, input.runId),
            eq(metaCatalogSyncRunModel.status, "running"),
          ),
        )
        .for("update")
      if (!current) {
        return
      }
      await metaCatalogItemRepository.markSucceeded(
        {
          integrationMetaCatalogId: input.integrationMetaCatalogId,
          catalogId: input.catalogId,
          items: input.succeededItems,
        },
        tx,
      )
      const succeededCount = input.succeededItems.length
      const errors = sanitizeItemErrors([
        ...(current?.itemErrors ?? []),
        ...input.errors,
      ])
      const failedCount = (current?.failedCount ?? 0) + input.errors.length
      const skippedCount = current?.skippedCount ?? 0
      const status = resolveMetaCatalogOutcome({
        succeededCount,
        failedCount,
        skippedCount,
      })
      await tx
        .update(metaCatalogSyncRunModel)
        .set({
          status,
          succeededCount,
          failedCount,
          itemErrors: errors.slice(0, MAX_DIAGNOSTIC_ITEMS),
          finishedAt: new Date(),
        })
        .where(eq(metaCatalogSyncRunModel.id, input.runId))
    })
  }

  /**
   * `error` is rendered in the workspace's sync history, so it is scrubbed here
   * rather than at each call site — a raw driver message would otherwise put the
   * failing SQL and its bound row IDs on screen.
   *
   * Takes the thrown value, not a pre-extracted message: a channel error carries
   * the sentence Meta wrote for end users on the object itself, and flattening
   * to `.message` first would leave nothing but "WhatsApp API call failed".
   */
  async fail(runId: string, error: unknown) {
    await db
      .update(metaCatalogSyncRunModel)
      .set({
        status: "failed",
        error: toPublicErrorMessage(error, GENERIC_SYNC_FAILURE),
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(metaCatalogSyncRunModel.id, runId),
          inArray(metaCatalogSyncRunModel.status, ["queued", "running"]),
        ),
      )
  }

  /**
   * Progress for a pull, written once per Meta page so the history row moves
   * while the job runs instead of appearing only at the end.
   *
   * Separate from `recordSubmission`: a push submits everything up front and
   * then polls for one verdict, while a pull learns its own total one page at a
   * time and has no handles to track.
   */
  async recordImportProgress(input: {
    runId: string
    totalCount: number
    succeededCount: number
    failedCount: number
  }) {
    await db
      .update(metaCatalogSyncRunModel)
      .set({
        totalCount: input.totalCount,
        succeededCount: input.succeededCount,
        failedCount: input.failedCount,
      })
      .where(
        and(
          eq(metaCatalogSyncRunModel.id, input.runId),
          eq(metaCatalogSyncRunModel.status, "running"),
        ),
      )
  }

  /**
   * Final state of a pull. `error` here is a per-product rejection summary, not
   * a thrown failure — a run that imported 8 of 10 products is `partial` and
   * still needs to say what happened to the other two.
   */
  async completeImport(input: {
    runId: string
    totalCount: number
    succeededCount: number
    failedCount: number
    error?: string
  }) {
    await db
      .update(metaCatalogSyncRunModel)
      .set({
        status: resolveMetaCatalogOutcome({
          succeededCount: input.succeededCount,
          failedCount: input.failedCount,
        }),
        totalCount: input.totalCount,
        succeededCount: input.succeededCount,
        failedCount: input.failedCount,
        error: input.error ? toPublicMetaCatalogMessage(input.error) : null,
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(metaCatalogSyncRunModel.id, input.runId),
          eq(metaCatalogSyncRunModel.status, "running"),
        ),
      )
  }

  /**
   * Enriches each run's skipped items with the product's current name — the
   * history view otherwise has nothing but the raw internal product id to show,
   * which means nothing to whoever is reading their sync history.
   */
  async list(workspaceId: string, limit = 20) {
    const runs = await db.query.metaCatalogSyncRunModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      limit,
    })
    const skippedProductIds = Array.from(
      new Set(
        runs.flatMap((run) => run.skippedItems.map((item) => item.productId)),
      ),
    )
    const products = await productRepository.findByIds({
      workspaceId,
      productIds: skippedProductIds,
    })
    const productNameById = new Map(
      products.map((product) => [product.id, product.name]),
    )
    return runs.map((run) => ({
      ...run,
      skippedItems: run.skippedItems.map((item) => ({
        ...item,
        productName: productNameById.get(item.productId),
      })),
    }))
  }

  /**
   * The catalog a single product last took part in, for the product detail
   * screen. Callers must already have proven the product belongs to the
   * workspace — the link table has no workspace of its own.
   */
  async findProductLink(productId: string) {
    return (
      (await metaCatalogItemRepository.findLatestByProductId(productId)) ?? null
    )
  }
}

export const metaCatalogSyncRunService = new MetaCatalogSyncRunService()
