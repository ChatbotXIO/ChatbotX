import {
  CONTACT_SYNC_CHUNK_BUDGET_MS,
  CONTACT_SYNC_DEFAULT_PAUSE_MS,
  CONTACT_SYNC_MAX_ATTEMPTS,
  CONTACT_SYNC_MAX_CONTACTS_PER_ITEM,
  CONTACT_SYNC_MAX_PAUSE_MS,
  CONTACT_SYNC_MIN_PAGE_SIZE,
  CONTACT_SYNC_PAGE_SIZE,
  CONTACT_SYNC_PAGES_PER_CHUNK,
  CONTACT_SYNC_RETRY_DELAY_MS,
  CONTACT_SYNC_RUN_ERRORS,
  type ContactSyncAdapter,
  type ContactSyncErrorKind,
  type ContactSyncPage,
  type ContactSyncRecordPage,
  type ContactSyncRequestScope,
  type ContactSyncSchema,
  type ContactSyncWorkerContext,
  contactSyncService,
} from "@chatbotx.io/business"
import {
  contactSyncSupportsChannel,
  importContactSyncPage,
  loadContactSyncMappingState,
} from "@chatbotx.io/business/contact-sync/import"
import type {
  ChannelType,
  ContactSyncTerminalItemStatus,
} from "@chatbotx.io/database/partials"
import type { ContactSyncRunGuard } from "@chatbotx.io/database/repositories"
import type {
  ContactSyncRunItemModel,
  ContactSyncRunModel,
} from "@chatbotx.io/database/types"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("contact-sync")

/** A touch after `pausedUntil`, so DB-clock skew never finds the pause unfinished. */
const PAUSE_RESUME_SLACK_MS = 1000

type ChunkContext = {
  run: ContactSyncRunModel
  expect: ContactSyncRunGuard
  startedAt: number
  pagesRead: number
  /**
   * The run's attempts as stored: retries without progress spend them, and
   * a recorded page or an ended item resets them (in the database too).
   */
  attempts: number
  adapter: ContactSyncAdapter
  /** The run's own signed-request scope: the actor snapshot taken at scheduling. */
  scope: ContactSyncRequestScope
  /** Contacts asked per page; halved when the source's answer was too large. */
  pageSize: number
}

/** No tag or field is synced: the source's schema is never fetched. */
const EMPTY_SCHEMA: ContactSyncSchema = { tags: [], fields: [] }

/** How one source ended this chunk. */
type ItemOutcome =
  | { kind: "itemDone" }
  | { kind: "yield" }
  | { kind: "pause"; pauseMs: number }
  /** A transient source failure: try again after a short wait. */
  | { kind: "retry" }
  /** The claim was lost or the run is being cancelled: stop touching it. */
  | { kind: "stop"; cancelling: boolean }

const isOverBudget = (ctx: ChunkContext) =>
  ctx.pagesRead >= CONTACT_SYNC_PAGES_PER_CHUNK ||
  Date.now() - ctx.startedAt >= CONTACT_SYNC_CHUNK_BUDGET_MS

const settledCount = (item: ContactSyncRunItemModel) =>
  item.createdCount + item.updatedCount + item.skippedCount + item.failedCount

const endItem = async (
  ctx: ChunkContext,
  item: ContactSyncRunItemModel,
  // The engine never cancels an item itself: only a disconnect does.
  status: Exclude<ContactSyncTerminalItemStatus, "cancelled">,
  currentError: string | null = null,
): Promise<ItemOutcome> => {
  const result = await contactSyncService.finishItem({
    runId: ctx.run.id,
    itemId: item.id,
    expect: ctx.expect,
    status,
    currentError,
  })
  if (result.outcome === "claimLost") {
    return { kind: "stop", cancelling: false }
  }
  ctx.attempts = 0
  // `itemInactive`: the item was cancelled meanwhile (its page went away);
  // the run goes on with the next one.
  if (result.outcome === "finished") {
    await handOffFollowUp(item)
  }
  return { kind: "itemDone" }
}

/**
 * The history sync an item owes (connect import) starts once the item ended,
 * outside the finish transaction; an item that owes none is a no-op there. A
 * failure here is not the run's: the sweep hands off whatever is still owed.
 */
const handOffFollowUp = async (item: ContactSyncRunItemModel) => {
  // Asked for every finished item: whether one is owed is read off the current
  // row (a second connect may have asked for it after this worker loaded it).
  try {
    await contactSyncService.handOffFollowUp(item.id)
  } catch (err) {
    log.error(
      { err, itemId: item.id },
      "contact sync: follow-up handoff failed, left to the sweep",
    )
  }
}

/** The source's own wait; none or zero would retry at once into the same limit. */
const rateLimitPauseMs = (retryAfterMs: number | null): number => {
  if (retryAfterMs && retryAfterMs > 0) {
    return retryAfterMs
  }
  return CONTACT_SYNC_DEFAULT_PAUSE_MS
}

type ErrorOutcomeHandler<Kind extends ContactSyncErrorKind["kind"]> = (input: {
  ctx: ChunkContext
  item: ContactSyncRunItemModel
  error: Extract<ContactSyncErrorKind, { kind: Kind }>
  cause: unknown
}) => Promise<ItemOutcome>

/** What the engine does with each kind of failed source call; each handler gets its own kind. */
const ERROR_OUTCOMES: {
  [Kind in ContactSyncErrorKind["kind"]]: ErrorOutcomeHandler<Kind>
} = {
  rateLimited: async ({ error }) => ({
    kind: "pause",
    pauseMs: rateLimitPauseMs(error.retryAfterMs),
  }),
  // Tried again shortly, one attempt per retry without progress in between.
  // Out of attempts, the source fails and the run goes on with the next one.
  retryable: ({ ctx, item }) => {
    if (ctx.attempts + 1 >= CONTACT_SYNC_MAX_ATTEMPTS) {
      return endItem(
        ctx,
        item,
        "failed",
        CONTACT_SYNC_RUN_ERRORS.sourceUnavailable,
      )
    }
    return Promise.resolve({ kind: "retry" })
  },
  // Answered with a smaller page inside `importPages`; reaching here means
  // even the smallest page was too large.
  responseTooLarge: ({ ctx, item }) =>
    endItem(ctx, item, "failed", CONTACT_SYNC_RUN_ERRORS.sourceUnavailable),
  // The page is gone from AhaChat: nothing to retry.
  pageMissing: ({ ctx, item }) =>
    endItem(ctx, item, "failed", CONTACT_SYNC_RUN_ERRORS.pageNotFound),
  fatal: ({ ctx, item }) =>
    endItem(ctx, item, "failed", CONTACT_SYNC_RUN_ERRORS.sourceUnavailable),
}

const onSourceError = (
  ctx: ChunkContext,
  item: ContactSyncRunItemModel,
  cause: unknown,
): Promise<ItemOutcome> => {
  const error = ctx.adapter.classifyError(cause)
  log.warn(
    { err: cause, runId: ctx.run.id, itemId: item.id, kind: error.kind },
    "contact sync: source call failed",
  )
  // `error.kind` picks the handler of that same kind; TypeScript cannot
  // correlate the two through the union on its own.
  const handler = ERROR_OUTCOMES[error.kind] as ErrorOutcomeHandler<
    typeof error.kind
  >
  return handler({ ctx, item, error, cause })
}

const pageOf = (item: ContactSyncRunItemModel): ContactSyncPage => ({
  channel: item.sourceChannel,
  pageId: item.sourceAccountId,
})

/**
 * Fixes the snapshot bound once, when the item first starts: a resumed item
 * keeps its bound (an empty source stays empty), a cancelled one is skipped.
 */
const startItem = async (
  ctx: ChunkContext,
  item: ContactSyncRunItemModel,
): Promise<{ item: ContactSyncRunItemModel } | ItemOutcome> => {
  if (item.status === "running" && item.boundReadAt) {
    return { item }
  }
  const upperBoundId = await ctx.adapter.readSnapshotBound(
    ctx.scope,
    pageOf(item),
  )
  const started = await contactSyncService.startItem({
    runId: ctx.run.id,
    itemId: item.id,
    expect: ctx.expect,
    upperBoundId,
  })
  if (started.outcome === "started") {
    return { item: started.item }
  }
  return started.outcome === "claimLost"
    ? { kind: "stop", cancelling: false }
    : { kind: "itemDone" }
}

/**
 * One source page, asked again with a half-size page while the answer is too
 * large (down to a floor), so one heavy contact cannot fail the item.
 */
const fetchPage = async (
  ctx: ChunkContext,
  item: ContactSyncRunItemModel,
  cursor: string | null,
  signal: AbortSignal,
): Promise<ContactSyncRecordPage> => {
  for (;;) {
    try {
      const page = await ctx.adapter.listRecords(ctx.scope, pageOf(item), {
        cursor,
        upperBoundId: item.upperBoundId,
        limit: ctx.pageSize,
        signal,
      })
      // A small page worked: grow back, so one heavy contact does not slow the
      // rest of the source.
      ctx.pageSize = Math.min(ctx.pageSize * 2, CONTACT_SYNC_PAGE_SIZE)
      return page
    } catch (cause) {
      if (
        signal.aborted ||
        ctx.adapter.classifyError(cause).kind !== "responseTooLarge" ||
        ctx.pageSize <= CONTACT_SYNC_MIN_PAGE_SIZE
      ) {
        throw cause
      }
      // Halve down to the smallest page, which is tried before giving up.
      ctx.pageSize = Math.max(
        Math.floor(ctx.pageSize / 2),
        CONTACT_SYNC_MIN_PAGE_SIZE,
      )
    }
  }
}

/**
 * Reads and imports pages of one source until it ends or the chunk budget
 * does. One page is read ahead while the previous one is written: a single
 * request in flight per page (the source allows no more), never read past the
 * durable cursor (it advances only after the write), and aborted and settled
 * before the chunk leaves, so the next chunk never meets it.
 */
const importPages = async (input: {
  ctx: ChunkContext
  item: ContactSyncRunItemModel
  context: ContactSyncWorkerContext
  inbox: { id: string; channel: ChannelType }
}): Promise<ItemOutcome> => {
  const { ctx, context, inbox } = input
  let item = input.item
  if (!item.upperBoundId) {
    // The source had no contact when the item started: nothing to import.
    return await endItem(ctx, item, "succeeded")
  }
  const page = pageOf(item)
  const syncsSchema = ctx.run.syncTags || ctx.run.syncCustomFields
  const schema = syncsSchema
    ? await ctx.adapter.listSchema(ctx.scope, page)
    : EMPTY_SCHEMA
  let state = await loadContactSyncMappingState(
    {
      workspaceId: ctx.run.workspaceId,
      page: { provider: ctx.run.provider, ...page },
    },
    schema,
  )
  let cursor = item.cursor
  let ahead: Promise<ContactSyncRecordPage> | null = null
  // Each source starts from the full page size.
  ctx.pageSize = CONTACT_SYNC_PAGE_SIZE
  const abort = new AbortController()
  try {
    while (!isOverBudget(ctx)) {
      const leased = await contactSyncService.renewLease({
        runId: ctx.run.id,
        expect: ctx.expect,
      })
      if (leased !== "running") {
        return { kind: "stop", cancelling: leased === "cancelling" }
      }
      if (settledCount(item) >= CONTACT_SYNC_MAX_CONTACTS_PER_ITEM) {
        return await endItem(
          ctx,
          item,
          "partial",
          CONTACT_SYNC_RUN_ERRORS.pageLimitReached,
        )
      }
      const current: ContactSyncRecordPage = await (ahead ??
        fetchPage(ctx, item, cursor, abort.signal))
      ahead = null
      // Read the next page while this one is written, unless the chunk is
      // about to yield anyway (the next chunk reads from the durable cursor).
      if (
        current.hasMore &&
        current.nextCursor &&
        ctx.pagesRead + 1 < CONTACT_SYNC_PAGES_PER_CHUNK &&
        Date.now() - ctx.startedAt < CONTACT_SYNC_CHUNK_BUDGET_MS
      ) {
        ahead = fetchPage(ctx, item, current.nextCursor, abort.signal)
        // A failure is reported when the page is awaited; never unhandled.
        ahead.catch(() => undefined)
      }
      const imported = await importContactSyncPage({
        context,
        page: { provider: ctx.run.provider, ...page },
        inbox,
        records: current.records,
        schema,
        state,
        options: ctx.run,
      })
      state = imported.state
      const counters = {
        ...imported.counters,
        failed: imported.counters.failed + current.invalidCount,
      }
      cursor = current.nextCursor ?? cursor
      ctx.pagesRead += 1
      const recorded = await contactSyncService.recordItemProgress({
        runId: ctx.run.id,
        itemId: item.id,
        expect: ctx.expect,
        cursor,
        counters,
      })
      if (recorded.outcome === "claimLost") {
        return { kind: "stop", cancelling: false }
      }
      // The progress write reset the run's attempts.
      ctx.attempts = 0
      if (recorded.outcome === "runCancelling") {
        return { kind: "stop", cancelling: true }
      }
      if (recorded.outcome === "itemInactive") {
        return { kind: "itemDone" }
      }
      item = {
        ...item,
        cursor,
        createdCount: item.createdCount + counters.created,
        updatedCount: item.updatedCount + counters.updated,
        skippedCount: item.skippedCount + counters.skipped,
        failedCount: item.failedCount + counters.failed,
        skippedValueCount: item.skippedValueCount + counters.skippedValues,
      }
      if (!current.hasMore) {
        // Rows that broke the source's contract are counted failed: the
        // source finished, but not completely.
        const status = item.failedCount > 0 ? "partial" : "succeeded"
        return await endItem(ctx, item, status)
      }
      if (!current.nextCursor) {
        // A source that says "more" without a cursor would loop forever.
        return await endItem(
          ctx,
          item,
          "partial",
          CONTACT_SYNC_RUN_ERRORS.sourceUnavailable,
        )
      }
    }
    return { kind: "yield" }
  } finally {
    // Whatever way the chunk leaves, a read in flight is aborted and ends first
    // (a lost claim, a cancel or a pause must not leave a request open).
    abort.abort()
    await ahead?.catch(() => undefined)
  }
}

const processItem = async (
  ctx: ChunkContext,
  item: ContactSyncRunItemModel,
  context: ContactSyncWorkerContext,
): Promise<ItemOutcome> => {
  const inbox = await contactSyncService.findItemInbox(item)
  if (!inbox) {
    return await endItem(
      ctx,
      item,
      "failed",
      CONTACT_SYNC_RUN_ERRORS.inboxUnavailable,
    )
  }
  if (!contactSyncSupportsChannel(inbox.channel)) {
    // A run created before the channel was dropped from the sync.
    return await endItem(
      ctx,
      item,
      "failed",
      CONTACT_SYNC_RUN_ERRORS.channelUnsupported,
    )
  }
  try {
    const started = await startItem(ctx, item)
    if ("kind" in started) {
      return started
    }
    return await importPages({ ctx, item: started.item, context, inbox })
  } catch (cause) {
    return await onSourceError(ctx, item, cause)
  }
}

const yieldAndContinue = async (
  ctx: ChunkContext,
  pauseMs?: number,
  countAttempt = false,
): Promise<void> => {
  const delayMs =
    pauseMs === undefined
      ? undefined
      : Math.min(pauseMs, CONTACT_SYNC_MAX_PAUSE_MS)
  const chunkSeq = await contactSyncService.yieldForContinuation({
    runId: ctx.run.id,
    expect: ctx.expect,
    ...(delayMs !== undefined && {
      pausedUntil: new Date(Date.now() + delayMs),
    }),
    countAttempt,
  })
  if (chunkSeq === null) {
    log.warn({ runId: ctx.run.id }, "contact sync: yield lost the claim")
    return
  }
  try {
    await contactSyncService.enqueueChunk(
      { ...ctx.run, chunkSeq },
      delayMs === undefined ? {} : { delayMs: delayMs + PAUSE_RESUME_SLACK_MS },
    )
  } catch (err) {
    log.error(
      { err, runId: ctx.run.id },
      "contact sync: continuation enqueue failed, left to the sweeper",
    )
    await contactSyncService.reopenReleased(ctx.run.id)
  }
}

const finishRun = async (ctx: ChunkContext, cancelling = false) =>
  await contactSyncService.finish({
    run: cancelling ? { ...ctx.run, status: "cancelling" } : ctx.run,
    expect: ctx.expect,
  })

/** Processes items in order until the run ends or the chunk must yield. */
const drive = async (ctx: ChunkContext): Promise<void> => {
  if (ctx.run.status === "cancelling") {
    await finishRun(ctx, true)
    return
  }
  const context = await contactSyncService.loadWorkerContext(
    ctx.run.workspaceId,
  )
  if (!context) {
    await finishRun(ctx, true)
    return
  }
  for (;;) {
    const item = await contactSyncService.findNextItem(ctx.run.id)
    if (!item) {
      // `open`: a page joined the run after the outcome was computed; read on.
      if ((await finishRun(ctx)) === "open") {
        continue
      }
      return
    }
    const outcome = await processItem(ctx, item, context)
    if (outcome.kind === "stop") {
      if (outcome.cancelling) {
        await finishRun(ctx, true)
      }
      return
    }
    if (outcome.kind === "pause") {
      return await yieldAndContinue(ctx, outcome.pauseMs)
    }
    if (outcome.kind === "retry") {
      return await yieldAndContinue(ctx, CONTACT_SYNC_RETRY_DELAY_MS, true)
    }
    if (outcome.kind === "yield" || isOverBudget(ctx)) {
      return await yieldAndContinue(ctx)
    }
  }
}

/**
 * Runs one budgeted chunk of a contact sync run. The run row is the only
 * input: the claim proves ownership, every write is guarded by it, and a
 * chunk that runs out of budget releases the lease and queues the next. Job
 * payloads carry no instructions, so a stale or forged job can only continue
 * a run that is genuinely live. At most one chunk per run runs at a time, and
 * at most one live run exists per workspace.
 */
export async function runContactSync(data: {
  runId: string
  workspaceId: string
}): Promise<void> {
  const run = await contactSyncService.claim(data)
  if (!run?.claimToken) {
    return
  }
  const ctx: ChunkContext = {
    run,
    expect: { claimToken: run.claimToken },
    startedAt: Date.now(),
    pagesRead: 0,
    attempts: run.attempts,
    adapter: contactSyncService.adapterFor(run.provider),
    scope: contactSyncService.scopeOfRun(run),
    pageSize: CONTACT_SYNC_PAGE_SIZE,
  }
  try {
    await drive(ctx)
  } catch (err) {
    log.error({ err, runId: run.id }, "contact sync: chunk crashed")
    // Leave the lease to expire: the sweeper re-dispatches after the stale
    // window; every page write converges, so a replay is harmless.
    throw err
  }
}
