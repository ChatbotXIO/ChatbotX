import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  gt,
  inArray,
  lt,
  or,
  sql,
} from "../../client"
import {
  INBOUND_WEBHOOK_REQUEST_ERROR_CODE,
  type InboundWebhookActionResult,
  type InboundWebhookFieldError,
  type InboundWebhookRequestStatus,
  type InboundWebhookTerminalStatus,
} from "../../partials/inbound-webhook"
import { inboundWebhookModel, inboundWebhookRequestModel } from "../../schema"
import type {
  InboundWebhookModel,
  InboundWebhookRequestModel,
} from "../../types"
import { type ChunkedPurgeStopReason, chunkedPurge } from "../chunked-purge"

export type InsertInboundWebhook = typeof inboundWebhookModel.$inferInsert
export type UpdateInboundWebhook = Partial<
  Pick<
    InsertInboundWebhook,
    | "name"
    | "active"
    | "token"
    | "inboxResolution"
    | "identifiers"
    | "fieldMappings"
    | "actions"
    | "sampleJson"
  >
>
export type InsertInboundWebhookRequest =
  typeof inboundWebhookRequestModel.$inferInsert

/** What a worker records on a request it owns, as it makes progress. */
export type InboundWebhookRequestProgress = {
  inboxId?: string | null
  contactId?: string | null
  contactInboxId?: string | null
  fieldErrors?: InboundWebhookFieldError[] | null
  actionResults?: InboundWebhookActionResult[] | null
}

export type InboundWebhookRequestCompletion = InboundWebhookRequestProgress & {
  status: InboundWebhookTerminalStatus
  skipReason?: string | null
  errorCode?: string | null
  errorMessage?: string | null
}

export type StaleInboundWebhookRequestRow = Pick<
  InboundWebhookRequestModel,
  "id" | "workspaceId" | "inboundWebhookId"
>

export async function insertInboundWebhook(
  values: InsertInboundWebhook,
  tx: DatabaseClient = db,
): Promise<InboundWebhookModel> {
  const [row] = await tx.insert(inboundWebhookModel).values(values).returning()
  if (!row) {
    throw new Error("Failed to insert inbound webhook")
  }
  return row
}

export async function updateInboundWebhook(
  input: { id: string; workspaceId: string; set: UpdateInboundWebhook },
  tx: DatabaseClient = db,
): Promise<InboundWebhookModel | null> {
  const [row] = await tx
    .update(inboundWebhookModel)
    .set(input.set)
    .where(
      and(
        eq(inboundWebhookModel.id, input.id),
        eq(inboundWebhookModel.workspaceId, input.workspaceId),
      ),
    )
    .returning()
  return row ?? null
}

export async function findInboundWebhookById(
  input: { id: string; workspaceId: string },
  tx: DatabaseClient = db,
): Promise<InboundWebhookModel | null> {
  const [row] = await tx
    .select()
    .from(inboundWebhookModel)
    .where(
      and(
        eq(inboundWebhookModel.id, input.id),
        eq(inboundWebhookModel.workspaceId, input.workspaceId),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * What the delivery hot path needs to accept or refuse a request, and nothing
 * more: the row also holds the config and a sample JSON of up to 64 KiB, which
 * must not be copied into the cache on every delivery.
 */
export type InboundWebhookIntake = Pick<
  InboundWebhookModel,
  "id" | "workspaceId" | "active"
> & { isConfigured: boolean }

/** Unscoped on purpose: the token is the capability that identifies the workspace. */
export async function findInboundWebhookIntakeByToken(
  token: string,
  tx: DatabaseClient = db,
): Promise<InboundWebhookIntake | null> {
  const [row] = await tx
    .select({
      id: inboundWebhookModel.id,
      workspaceId: inboundWebhookModel.workspaceId,
      active: inboundWebhookModel.active,
      isConfigured: sql<boolean>`${inboundWebhookModel.inboxResolution} IS NOT NULL`,
    })
    .from(inboundWebhookModel)
    .where(eq(inboundWebhookModel.token, token))
    .limit(1)
  return row ?? null
}

export async function countInboundWebhooks(
  workspaceId: string,
  tx: DatabaseClient = db,
): Promise<number> {
  const [row] = await tx
    .select({ count: count() })
    .from(inboundWebhookModel)
    .where(eq(inboundWebhookModel.workspaceId, workspaceId))
  return row?.count ?? 0
}

/** What a list shows: never the token, the config or the (up to 64 KiB) sample. */
export type InboundWebhookListRow = Pick<
  InboundWebhookModel,
  "id" | "name" | "active" | "createdAt" | "updatedAt" | "requestCount"
>

export async function listInboundWebhooksPaginated(
  input: { workspaceId: string; limit: number; offset: number },
  tx: DatabaseClient = db,
): Promise<{ rows: InboundWebhookListRow[]; total: number }> {
  const where = eq(inboundWebhookModel.workspaceId, input.workspaceId)
  const [rows, total] = await Promise.all([
    tx
      .select({
        id: inboundWebhookModel.id,
        name: inboundWebhookModel.name,
        active: inboundWebhookModel.active,
        createdAt: inboundWebhookModel.createdAt,
        updatedAt: inboundWebhookModel.updatedAt,
        requestCount: inboundWebhookModel.requestCount,
      })
      .from(inboundWebhookModel)
      .where(where)
      .orderBy(
        desc(inboundWebhookModel.createdAt),
        desc(inboundWebhookModel.id),
      )
      .limit(input.limit)
      .offset(input.offset),
    tx.select({ count: count() }).from(inboundWebhookModel).where(where),
  ])
  return { rows, total: total[0]?.count ?? 0 }
}

/** Returns the ids it removed (ids of another workspace are ignored). */
export async function deleteInboundWebhooks(
  input: { workspaceId: string; ids: string[] },
  tx: DatabaseClient = db,
): Promise<{ id: string }[]> {
  if (input.ids.length === 0) {
    return []
  }
  return await tx
    .delete(inboundWebhookModel)
    .where(
      and(
        eq(inboundWebhookModel.workspaceId, input.workspaceId),
        inArray(inboundWebhookModel.id, input.ids),
      ),
    )
    .returning({ id: inboundWebhookModel.id })
}

/**
 * Moves the all-time request counter. `updatedAt` is written back unchanged: it
 * means "the configuration changed", which a delivery does not do.
 */
const incrementRequestCount = (tx: DatabaseClient, inboundWebhookId: string) =>
  tx
    .update(inboundWebhookModel)
    .set({
      requestCount: sql`${inboundWebhookModel.requestCount} + 1`,
      updatedAt: sql`${inboundWebhookModel.updatedAt}`,
    })
    .where(eq(inboundWebhookModel.id, inboundWebhookId))

/**
 * `null` when the idempotency key was already recorded for this webhook. The
 * row and the counter move together, so a crash can never leave them apart.
 */
export function insertInboundWebhookRequest(
  values: InsertInboundWebhookRequest,
  client: DatabaseClient = db,
): Promise<InboundWebhookRequestModel | null> {
  return client.transaction(async (tx) => {
    const [row] = await tx
      .insert(inboundWebhookRequestModel)
      .values(values)
      .onConflictDoNothing()
      .returning()
    if (!row) {
      return null
    }
    await incrementRequestCount(tx, row.inboundWebhookId)
    return row
  })
}

/**
 * Takes ownership of a request in one statement: a `received` row, or a
 * `processing` row whose lease expired. Whoever gets the row back owns it;
 * every other call returns `null`.
 */
export async function claimInboundWebhookRequest(
  input: { id: string; claimToken: string; leaseExpiredBefore: Date },
  tx: DatabaseClient = db,
): Promise<InboundWebhookRequestModel | null> {
  const [row] = await tx
    .update(inboundWebhookRequestModel)
    .set({
      status: "processing",
      claimToken: input.claimToken,
      claimedAt: new Date(),
      attempts: sql`${inboundWebhookRequestModel.attempts} + 1`,
    })
    .where(
      and(
        eq(inboundWebhookRequestModel.id, input.id),
        or(
          eq(inboundWebhookRequestModel.status, "received"),
          and(
            eq(inboundWebhookRequestModel.status, "processing"),
            lt(inboundWebhookRequestModel.claimedAt, input.leaseExpiredBefore),
          ),
        ),
      ),
    )
    .returning()
  return row ?? null
}

/** Only the current owner of the claim may write; `false` means it was fenced out. */
const ownedByClaim = (input: { id: string; claimToken: string }) =>
  and(
    eq(inboundWebhookRequestModel.id, input.id),
    eq(inboundWebhookRequestModel.status, "processing"),
    eq(inboundWebhookRequestModel.claimToken, input.claimToken),
  )

/**
 * Records progress and renews the lease (`claimedAt`), so a long action
 * sequence is not reclaimed while its owner is still making progress.
 */
export async function checkpointInboundWebhookRequest(
  input: {
    id: string
    claimToken: string
    progress: InboundWebhookRequestProgress
  },
  tx: DatabaseClient = db,
): Promise<boolean> {
  const rows = await tx
    .update(inboundWebhookRequestModel)
    .set({ ...input.progress, claimedAt: new Date() })
    .where(ownedByClaim(input))
    .returning({ id: inboundWebhookRequestModel.id })
  return rows.length > 0
}

/** Gives the request back (`processing` → `received`) before a retryable failure. */
export async function releaseInboundWebhookRequest(
  input: { id: string; claimToken: string },
  tx: DatabaseClient = db,
): Promise<boolean> {
  const rows = await tx
    .update(inboundWebhookRequestModel)
    .set({ status: "received", claimToken: null, claimedAt: null })
    .where(ownedByClaim(input))
    .returning({ id: inboundWebhookRequestModel.id })
  return rows.length > 0
}

export async function completeInboundWebhookRequest(
  input: {
    id: string
    claimToken: string
    completion: InboundWebhookRequestCompletion
  },
  tx: DatabaseClient = db,
): Promise<boolean> {
  const rows = await tx
    .update(inboundWebhookRequestModel)
    .set({ ...input.completion, processedAt: new Date() })
    .where(ownedByClaim(input))
    .returning({ id: inboundWebhookRequestModel.id })
  return rows.length > 0
}

export async function findInboundWebhookRequest(
  input: { id: string; workspaceId: string; inboundWebhookId?: string },
  tx: DatabaseClient = db,
): Promise<InboundWebhookRequestModel | null> {
  const [row] = await tx
    .select()
    .from(inboundWebhookRequestModel)
    .where(
      and(
        eq(inboundWebhookRequestModel.id, input.id),
        eq(inboundWebhookRequestModel.workspaceId, input.workspaceId),
        input.inboundWebhookId
          ? eq(
              inboundWebhookRequestModel.inboundWebhookId,
              input.inboundWebhookId,
            )
          : undefined,
      ),
    )
    .limit(1)
  return row ?? null
}

/** A request without its payload (up to 256 KiB), `fieldErrors` and `actionResults`; the detail view loads those. */
export type InboundWebhookRequestListRow = Pick<
  InboundWebhookRequestModel,
  | "id"
  | "status"
  | "skipReason"
  | "errorCode"
  | "errorMessage"
  | "inboxId"
  | "contactId"
  | "attempts"
  | "createdAt"
  | "processedAt"
>

export async function listInboundWebhookRequestsPaginated(
  input: {
    workspaceId: string
    inboundWebhookId: string
    status?: InboundWebhookRequestStatus
    limit: number
    offset: number
  },
  tx: DatabaseClient = db,
): Promise<{ rows: InboundWebhookRequestListRow[]; total: number }> {
  const where = and(
    eq(inboundWebhookRequestModel.workspaceId, input.workspaceId),
    eq(inboundWebhookRequestModel.inboundWebhookId, input.inboundWebhookId),
    input.status
      ? eq(inboundWebhookRequestModel.status, input.status)
      : undefined,
  )
  const [rows, total] = await Promise.all([
    tx
      .select({
        id: inboundWebhookRequestModel.id,
        status: inboundWebhookRequestModel.status,
        skipReason: inboundWebhookRequestModel.skipReason,
        errorCode: inboundWebhookRequestModel.errorCode,
        errorMessage: inboundWebhookRequestModel.errorMessage,
        inboxId: inboundWebhookRequestModel.inboxId,
        contactId: inboundWebhookRequestModel.contactId,
        attempts: inboundWebhookRequestModel.attempts,
        createdAt: inboundWebhookRequestModel.createdAt,
        processedAt: inboundWebhookRequestModel.processedAt,
      })
      .from(inboundWebhookRequestModel)
      .where(where)
      .orderBy(
        desc(inboundWebhookRequestModel.createdAt),
        desc(inboundWebhookRequestModel.id),
      )
      .limit(input.limit)
      .offset(input.offset),
    tx.select({ count: count() }).from(inboundWebhookRequestModel).where(where),
  ])
  return { rows, total: total[0]?.count ?? 0 }
}

/** `received` for too long (never enqueued, or the job was lost) or `processing` past its lease. */
const unfinishedRequest = (input: {
  receivedBefore: Date
  leaseExpiredBefore: Date
}) =>
  or(
    and(
      eq(inboundWebhookRequestModel.status, "received"),
      lt(inboundWebhookRequestModel.createdAt, input.receivedBefore),
    ),
    and(
      eq(inboundWebhookRequestModel.status, "processing"),
      lt(inboundWebhookRequestModel.claimedAt, input.leaseExpiredBefore),
    ),
  )

/**
 * Requests the worker never finished and that are still worth retrying:
 * younger than `createdAfter`, so a request that can never be processed (for
 * example one whose workspace is blocked) is not re-enqueued forever.
 */
export async function listStaleInboundWebhookRequests(
  input: {
    receivedBefore: Date
    leaseExpiredBefore: Date
    createdAfter: Date
    limit: number
  },
  tx: DatabaseClient = db,
): Promise<StaleInboundWebhookRequestRow[]> {
  return await tx
    .select({
      id: inboundWebhookRequestModel.id,
      workspaceId: inboundWebhookRequestModel.workspaceId,
      inboundWebhookId: inboundWebhookRequestModel.inboundWebhookId,
    })
    .from(inboundWebhookRequestModel)
    .where(
      and(
        gt(inboundWebhookRequestModel.createdAt, input.createdAfter),
        unfinishedRequest(input),
      ),
    )
    .orderBy(asc(inboundWebhookRequestModel.createdAt))
    .limit(input.limit)
}

/**
 * Closes unfinished requests older than `createdBefore` as `failed`
 * (`abandoned`), so none stays pending forever once re-dispatch stops
 * retrying it. Returns how many were closed.
 */
export async function failAbandonedInboundWebhookRequests(
  input: {
    createdBefore: Date
    receivedBefore: Date
    leaseExpiredBefore: Date
  },
  tx: DatabaseClient = db,
): Promise<number> {
  const rows = await tx
    .update(inboundWebhookRequestModel)
    .set({
      status: "failed",
      errorCode: INBOUND_WEBHOOK_REQUEST_ERROR_CODE.abandoned,
      claimToken: null,
      processedAt: new Date(),
    })
    .where(
      and(
        lt(inboundWebhookRequestModel.createdAt, input.createdBefore),
        unfinishedRequest(input),
      ),
    )
    .returning({ id: inboundWebhookRequestModel.id })
  return rows.length
}

export type PurgeInboundWebhookRequestsOptions = {
  retentionDays: number
  chunkSize: number
  interChunkDelayMs: number
  maxChunks: number
  maxRunDurationMs?: number
}

/**
 * Chunked retention delete (see `chunkedPurge`) by age. In-flight rows are not
 * spared: one still unfinished after the retention window was abandoned long
 * ago (re-dispatch gives up after a day), and keeping it would leak.
 */
export function purgeInboundWebhookRequests(
  options: PurgeInboundWebhookRequestsOptions,
): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
  const { retentionDays, ...bounds } = options
  return chunkedPurge({
    table: "InboundWebhookRequest",
    where: sql`"createdAt" < NOW() - make_interval(days => ${retentionDays})`,
    orderBy: "createdAt",
    ...bounds,
  })
}
