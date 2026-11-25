import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  SocialPostFeedItemOutcome,
  SocialPostFeedWaitingReason,
} from "@chatbotx.io/database/partials"
import {
  type SocialPostFeedRow,
  type SocialPostFeedRunResult,
  socialPostFeedRepository,
  socialPostRepository,
  socialPostSnippetRepository,
} from "@chatbotx.io/database/repositories"
import { dailyCapFor } from "@chatbotx.io/utils/publish-limits"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { requestHash } from "../social-post/hash"
import { emitSocialPostChanged } from "../social-post/notify"
import { socialPostScheduleService } from "../social-post/schedule.service"
import { socialPostService } from "../social-post/service"
import {
  discardImportedFile,
  ImageBudget,
  pictureCandidates,
} from "./feed-media"
import { prepareFeedPost } from "./feed-post"
import type { FeedDestination } from "./feed-shape"
import { registeredFeedFetcher } from "./fetcher"
import { evaluateItemFilters } from "./item-filter"
import {
  POST_FEED_LEASE_MS,
  POST_FEED_LEDGER_RETENTION_MS,
  POST_FEED_MAX_CONSECUTIVE_FAILURES,
  POST_FEED_MAX_ITEM_AGE_MS,
  POST_FEED_MAX_STALE_RETRIES,
  POST_FEED_STALE_RETRY_MS,
} from "./limits"
import { type ParsedFeedItem, parseFeed } from "./parse"
import { enqueueFeedCheck, markFeedDueAgain, scanDueFeeds } from "./queue"
import {
  errorCodeOf,
  FeedLeaseLostError,
  FeedPostBlockedError,
  IDEMPOTENCY_CONFLICT_CODE,
  itemRefusalReason,
  ledgerRowOf,
  stopReasonOf,
  summaryOf,
} from "./run-outcome"
import type { RunFeedResult } from "./types"

export { FeedPostBlockedError, itemRefusalReason } from "./run-outcome"

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/**
 * The next check of a finished run: one interval after it ended, whatever the
 * scan had planned (a job that waited in the queue past its interval would
 * otherwise be due again at once and a backlog would never drain).
 */
const nextIntervalCheck = (intervalMinutes: number): Date =>
  new Date(Date.now() + intervalMinutes * MINUTE_MS)
/** Ledger rows one check prunes. */
const PRUNE_BATCH = 500

/** Pictures one run may try to import: every candidate item, two pictures each. */
const IMAGE_ATTEMPTS_PER_ITEM = 2
/** Items one check may try per post it may create (every outcome counts). */
const ATTEMPTS_PER_PLACE = 3

type CheckContext = {
  budget: ImageBudget
  destinations: FeedDestination[]
  signature: string | null
  timeZone: string
}

/**
 * The feed's own daily cap never exceeds the smallest per-destination cap of
 * its destinations (the pace registry), so a burst cannot ask for more than a
 * destination may publish in 24 hours.
 */
const destinationDailyCap = (
  destinations: readonly FeedDestination[],
): number =>
  Math.min(
    Number.POSITIVE_INFINITY,
    ...destinations.map(
      (destination) => dailyCapFor(destination.provider, "text").limit,
    ),
  )

/** The worker side of the feeds: the due scan, the queue hand-off and one check of one feed. */
class SocialPostFeedRunner {
  /** One scan tick; see `scanDueFeeds`. */
  async scanDue(now: Date = new Date()): Promise<number> {
    return await scanDueFeeds(now)
  }

  /** Queues one check and says whether it was added; see `enqueueFeedCheck`. */
  async enqueue(feedId: string, workspaceId: string): Promise<boolean> {
    return await enqueueFeedCheck(feedId, workspaceId)
  }

  /**
   * One check of one feed: take its lease, fetch, parse, and turn the items the
   * ledger has not seen into posts. The first check only records what the feed
   * already had. A failure is counted and, after five in a row, parks the feed
   * in `error`.
   */
  async runFeed(input: {
    id: string
    workspaceId: string
  }): Promise<RunFeedResult> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + POST_FEED_LEASE_MS)
    const feed = await socialPostFeedRepository.claimRun({
      ...input,
      leaseUntil,
      now,
    })
    if (!feed) {
      return { kind: "skipped" }
    }
    const finish = async (result: SocialPostFeedRunResult): Promise<void> => {
      const stored = await socialPostFeedRepository.finishRun({
        ...input,
        leaseUntil,
        now,
        result,
      })
      if (!stored) {
        // The lease was lost (the address was changed under the check): the edit asked for a check at once, and a tick may have pushed it an interval ahead.
        await markFeedDueAgain(input.id, input.workspaceId, true)
      }
    }
    try {
      const outcome = await this.check(feed, now, leaseUntil)
      const stale = outcome.result.kind === "stale"
      const summary = summaryOf(
        outcome.result,
        outcome.result.kind === "stale" ? outcome.result.retries : 0,
      )
      logger.info(
        {
          feedId: feed.id,
          ...summary,
          deferred: summary.waiting,
          eligible:
            outcome.result.kind === "checked" ? outcome.result.eligible : 0,
          skipped:
            outcome.result.kind === "checked" ? outcome.result.skipped : 0,
          stale,
        },
        "social-post feed: check finished",
      )
      await finish({
        // A stale copy is not a success or a failure: the counters and the last error stay as they were.
        consecutiveFailures: stale ? feed.consecutiveFailures : 0,
        etag: outcome.etag,
        lastErrorCode: stale ? feed.lastErrorCode : null,
        lastModified: outcome.lastModified,
        nextCheckAt: stale
          ? new Date(now.getTime() + POST_FEED_STALE_RETRY_MS)
          : nextIntervalCheck(feed.intervalMinutes),
        primedAt: outcome.primedAt,
        status: "active",
        summary,
      })
      return outcome.result
    } catch (err) {
      if (err instanceof FeedLeaseLostError) {
        logger.info(
          { feedId: feed.id },
          "social-post feed: the check lost its lease and stopped",
        )
        // finishRun matches on the same lease, so it could never store a result: only make the feed due again.
        await markFeedDueAgain(input.id, input.workspaceId, true)
        return { kind: "skipped" }
      }
      const code = errorCodeOf(err)
      const failures = feed.consecutiveFailures + 1
      if (err instanceof FeedPostBlockedError) {
        logger.warn(
          { detail: err.detail, feedId: feed.id },
          "social-post feed: a post was refused for a reason that is not the item, the check stopped",
        )
      }
      if (code === "internal") {
        logger.error(
          { err, feedId: feed.id },
          "social-post feed: check crashed",
        )
      }
      await finish({
        consecutiveFailures: failures,
        etag: feed.etag,
        lastErrorCode: code,
        lastModified: feed.lastModified,
        nextCheckAt: nextIntervalCheck(feed.intervalMinutes),
        primedAt: feed.primedAt,
        status:
          failures >= POST_FEED_MAX_CONSECUTIVE_FAILURES ? "error" : "active",
        summary: summaryOf({ code, kind: "failed" }, 0),
      })
      return { code, kind: "failed" }
    }
  }

  /**
   * A CDN can serve an older copy of the source. When the newest item of the
   * fetched copy is older than the newest the ledger has seen, the copy is
   * stale: writing from it would do nothing (its items are all known) and
   * would hide that the source has moved on. At most three early re-checks in a
   * row; after them the copy is taken as the truth (the newest items may have
   * been removed from the source on purpose).
   */
  private async staleCopy(
    feed: SocialPostFeedRow,
    items: ParsedFeedItem[],
    now: Date,
  ): Promise<{ retries: number } | null> {
    if (!feed.primedAt) {
      return null
    }
    const previous = feed.lastRunSummary
    const retries = previous?.kind === "stale" ? previous.staleRetries : 0
    if (retries >= POST_FEED_MAX_STALE_RETRIES) {
      return null
    }
    const dates = items
      .map((item) => item.publishedAt?.getTime())
      .filter((time): time is number => time !== undefined)
    if (dates.length === 0) {
      return null
    }
    // Only this address's history, and no date from the future: see `maxPublishedAt`.
    const watermark = await socialPostFeedRepository.maxPublishedAt({
      feedId: feed.id,
      notAfter: now,
      since: feed.startedAt,
      workspaceId: feed.workspaceId,
    })
    return watermark && Math.max(...dates) < watermark.getTime()
      ? { retries: retries + 1 }
      : null
  }

  private async check(
    feed: SocialPostFeedRow,
    now: Date,
    leaseUntil: Date,
  ): Promise<{
    etag: string | null
    lastModified: string | null
    primedAt: Date | null
    result: RunFeedResult
  }> {
    const fetcher = registeredFeedFetcher()
    if (!fetcher) {
      throw new Error("No feed fetcher is registered")
    }
    const fetched = await fetcher({
      etag: feed.etag,
      lastModified: feed.lastModified,
      url: feed.feedUrl,
    })
    if (fetched.kind === "notModified") {
      return {
        etag: feed.etag,
        lastModified: feed.lastModified,
        primedAt: feed.primedAt,
        result: { kind: "notModified" },
      }
    }
    const items = await parseFeed(fetched.body)
    const stale = await this.staleCopy(feed, items, now)
    if (stale) {
      // Nothing is written and the validators of the copy are NOT kept, so the next check is not answered 304 from a stale body.
      return {
        etag: feed.etag,
        lastModified: feed.lastModified,
        primedAt: feed.primedAt,
        result: { kind: "stale", retries: stale.retries },
      }
    }
    const validators = {
      etag: fetched.etag,
      lastModified: fetched.lastModified,
    }
    if (!feed.primedAt) {
      const first = await this.prime(feed, items, now, leaseUntil)
      return {
        ...validators,
        primedAt: now,
        result: {
          created: first.created,
          eligible: first.created + first.invalid,
          fresh: items.length,
          invalid: first.invalid,
          items: items.length,
          kind: "checked",
          primed: true,
          skipped: items.length - first.created - first.invalid,
          waiting: 0,
        },
      }
    }
    const result = await this.process(feed, items, now, leaseUntil)
    await socialPostFeedRepository.pruneItems({
      before: new Date(now.getTime() - POST_FEED_LEDGER_RETENTION_MS),
      feedId: feed.id,
      limit: PRUNE_BATCH,
      workspaceId: feed.workspaceId,
    })
    // Items left for a later check (a per-run, daily or picture cap) are not in the ledger: the
    // validators are dropped so the next check re-reads the body instead of being answered 304.
    const deferred = result.kind === "checked" && result.waiting > 0
    return {
      ...(deferred ? { etag: null, lastModified: null } : validators),
      primedAt: feed.primedAt,
      result,
    }
  }

  /**
   * Runs a worker side effect (ledger rows, a post) in a transaction that first
   * locks the feed and checks that this check still owns its lease. A check
   * that lost it (the address was changed under it) throws and writes nothing.
   */
  private async fenced<T>(
    feed: Pick<SocialPostFeedRow, "id" | "workspaceId">,
    leaseUntil: Date,
    run: (tx: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    return await db.transaction(async (tx) => {
      if (
        !(await socialPostFeedRepository.lockLease(
          { id: feed.id, leaseUntil, workspaceId: feed.workspaceId },
          tx,
        ))
      ) {
        throw new FeedLeaseLostError()
      }
      return await run(tx)
    })
  }

  /**
   * Records every item the feed already has; none of them becomes a post,
   * except the newest one when the feed asks for it (`postLatestOnFirstCheck`)
   * and it passes the feed's filters.
   */
  private async prime(
    feed: SocialPostFeedRow,
    items: ParsedFeedItem[],
    now: Date,
    leaseUntil: Date,
  ): Promise<{ created: number; invalid: number }> {
    const context = await this.checkContext(feed)
    const [first] = feed.postLatestOnFirstCheck ? items : []
    const firstVerdict = first
      ? this.filterVerdict(feed, first, context, now)
      : null
    const latest = first && firstVerdict === null ? first : undefined
    await this.fenced(feed, leaseUntil, (tx) =>
      socialPostFeedRepository.insertItems(
        items
          .filter((item) => item !== latest)
          .map((item) => {
            const reason = item === first ? firstVerdict : null
            return {
              ...ledgerRowOf(feed, item),
              outcome: reason
                ? ("skippedFiltered" as const)
                : ("skippedOld" as const),
              reason: reason ?? "existing",
            }
          }),
        tx,
      ),
    )
    if (!latest) {
      return { created: 0, invalid: 0 }
    }
    const outcome = await this.createFromItem({
      ...context,
      feed,
      item: latest,
      leaseUntil,
    })
    return {
      created: outcome === "created" ? 1 : 0,
      invalid: outcome === "invalid" ? 1 : 0,
    }
  }

  /** The reason code when the feed's filters drop the item, else null. */
  private filterVerdict(
    feed: SocialPostFeedRow,
    item: ParsedFeedItem,
    context: CheckContext,
    now: Date,
  ): string | null {
    const verdict = evaluateItemFilters(feed.filters, item, {
      hasImage: pictureCandidates(feed, item, context.timeZone).length > 0,
      now,
    })
    return verdict.pass ? null : verdict.reason
  }

  /** The destinations (with their network), signature text, time zone and image budget of one check. */
  private async checkContext(feed: SocialPostFeedRow): Promise<CheckContext> {
    const destinationIds = (
      await socialPostFeedRepository.listDestinations({
        feedIds: [feed.id],
        workspaceId: feed.workspaceId,
      })
    ).map((link) => link.destinationId)
    const found = await socialPostRepository.findDestinations({
      ids: destinationIds,
      workspaceId: feed.workspaceId,
    })
    const signature = feed.signatureId
      ? await socialPostSnippetRepository.findById({
          id: feed.signatureId,
          workspaceId: feed.workspaceId,
        })
      : null
    return {
      budget: new ImageBudget(
        feed.maxItemsPerRun * IMAGE_ATTEMPTS_PER_ITEM,
        // At most one article page per item the run may post (and one for the first-check item).
        feed.fetchArticleImage ? feed.maxItemsPerRun : 0,
        // Never fewer attempts per host than the check may post: one CDN host serves most feeds.
        feed.maxItemsPerRun * (IMAGE_ATTEMPTS_PER_ITEM + 1),
      ),
      destinations: found.map((destination) => ({
        id: destination.id,
        provider: destination.provider,
      })),
      signature: signature?.kind === "signature" ? signature.content : null,
      timeZone: await socialPostFeedRepository.findWorkspaceTimezone(
        feed.workspaceId,
      ),
    }
  }

  private async process(
    feed: SocialPostFeedRow,
    items: ParsedFeedItem[],
    now: Date,
    leaseUntil: Date,
  ): Promise<RunFeedResult> {
    const known = await socialPostFeedRepository.findKnownKeys({
      feedId: feed.id,
      itemKeys: items.map((item) => item.itemKey),
      workspaceId: feed.workspaceId,
    })
    const fresh = items.filter((item) => !known.has(item.itemKey))
    const oldest = Math.max(
      feed.startedAt.getTime(),
      now.getTime() - POST_FEED_MAX_ITEM_AGE_MS,
    )
    // An undated item cannot be proven newer than the feed, so it never posts.
    const isOld = (item: ParsedFeedItem) =>
      item.publishedAt === null || item.publishedAt.getTime() < oldest
    const context = await this.checkContext(feed)
    const notOld = fresh.filter((item) => !isOld(item))
    // Filters run BEFORE the capacity: a dropped item never uses a slot, and it is
    // recorded for good (changing the filters later does not bring it back).
    const filteredOut = new Map<string, string>()
    for (const item of notOld) {
      const reason = this.filterVerdict(feed, item, context, now)
      if (reason) {
        filteredOut.set(item.itemKey, reason)
      }
    }
    // Oldest first (inside the 7-day window), so a burst is posted in the order it was published.
    const eligible = notOld
      .filter((item) => !filteredOut.has(item.itemKey))
      .sort(
        (left, right) =>
          (left.publishedAt?.getTime() ?? 0) -
          (right.publishedAt?.getTime() ?? 0),
      )
    // Only what is decided for good is recorded here. An item beyond the per-check limit
    // is NOT recorded: whether it is needed depends on what happens to the items before
    // it (a refused one frees its place), and the next check takes it.
    await this.fenced(feed, leaseUntil, (tx) =>
      socialPostFeedRepository.insertItems(
        [
          ...fresh.filter(isOld).map((item) => ({
            ...ledgerRowOf(feed, item),
            outcome: "skippedOld" as const,
            reason: item.publishedAt === null ? "undated" : "tooOld",
          })),
          ...notOld
            .filter((item) => filteredOut.has(item.itemKey))
            .map((item) => ({
              ...ledgerRowOf(feed, item),
              outcome: "skippedFiltered" as const,
              reason: filteredOut.get(item.itemKey) ?? "filtered",
            })),
        ],
        tx,
      ),
    )

    const dailyCap = Math.min(
      feed.dailyCap,
      destinationDailyCap(context.destinations),
    )
    let remainingToday =
      dailyCap -
      (await socialPostFeedRepository.countCreatedSince({
        feedId: feed.id,
        workspaceId: feed.workspaceId,
        since: new Date(now.getTime() - DAY_MS),
      }))
    const tally = { created: 0, invalid: 0 }
    let settled = 0
    // Every outcome counts as an attempt, so a long run of refused items cannot keep the
    // check busy (or hold its lease) for ever; the rest waits, unrecorded, for the next check.
    const maxAttempts = feed.maxItemsPerRun * ATTEMPTS_PER_PLACE
    let attempts = 0
    let stopReason: SocialPostFeedWaitingReason | null = null
    for (const item of eligible) {
      stopReason = stopReasonOf({
        attempts,
        created: tally.created,
        elapsedMs: Date.now() - now.getTime(),
        maxAttempts,
        maxItemsPerRun: feed.maxItemsPerRun,
        remainingToday,
      })
      if (stopReason) {
        // Left out of the ledger: the next check takes it, while it is not too old.
        break
      }
      attempts += 1
      const outcome = await this.createFromItem({
        ...context,
        feed,
        item,
        leaseUntil,
      })
      if (outcome === "defer") {
        // The picture budget of this check is spent: the item is tried again next check.
        stopReason = "pictureBudget"
        break
      }
      settled += 1
      if (outcome === "created") {
        tally.created += 1
        remainingToday -= 1
      } else if (outcome === "invalid") {
        // A refused item does not use one of the check's places.
        tally.invalid += 1
      }
    }
    const waiting = eligible.length - settled
    const waitingReason = waiting > 0 && stopReason ? stopReason : undefined
    const nextSlotAt =
      waitingReason === "dailyCap"
        ? await this.nextSlotAt(feed, now, Math.max(0, -remainingToday))
        : undefined
    return {
      created: tally.created,
      eligible: eligible.length,
      fresh: fresh.length,
      invalid: tally.invalid,
      items: items.length,
      kind: "checked",
      primed: false,
      skipped: fresh.length - tally.created - tally.invalid,
      waiting,
      ...(waitingReason ? { waitingReason } : {}),
      ...(waitingReason === "dailyCap" ? { dailyCap } : {}),
      ...(nextSlotAt ? { nextSlotAt } : {}),
    }
  }

  /** When the rolling 24 h cap frees a place: the oldest counted post plus 24 h. */
  private async nextSlotAt(
    feed: Pick<SocialPostFeedRow, "id" | "workspaceId">,
    now: Date,
    offset: number,
  ): Promise<string | undefined> {
    const oldest = await socialPostFeedRepository.oldestCreatedSince({
      feedId: feed.id,
      workspaceId: feed.workspaceId,
      offset,
      since: new Date(now.getTime() - DAY_MS),
    })
    return oldest
      ? new Date(oldest.getTime() + DAY_MS).toISOString()
      : undefined
  }

  /**
   * The picture is imported FIRST, outside any transaction (`prepareFeedPost`);
   * only its stable Media Library id enters the transaction in which the ledger
   * row and the post are written together: an item becomes a post exactly once
   * (the unique key decides two workers racing), or nothing is written and the
   * next check tries it again with the same picture file. An item the platform
   * refuses (no posting schedule, text over a limit, a destination that went
   * away) is recorded as skipped instead of being retried for ever.
   */
  private async createFromItem(
    input: CheckContext & {
      feed: SocialPostFeedRow
      item: ParsedFeedItem
      leaseUntil: Date
    },
  ): Promise<"created" | "defer" | "duplicate" | "invalid"> {
    const { feed, item, leaseUntil } = input
    const { workspaceId } = feed
    const prepared = await prepareFeedPost({
      ...input,
      purpose: "post",
    })
    if (prepared.kind === "defer") {
      return "defer"
    }
    /** One ledger row of this item: the shared columns, what preparation recorded, and the destinations it dropped. */
    const ledgerInsert = (
      outcome: SocialPostFeedItemOutcome,
      reason: string | null,
      dropped: readonly string[] = prepared.droppedDestinationIds,
    ) => ({
      ...ledgerRowOf(feed, item),
      ...prepared.columns,
      droppedDestinationIds: dropped.length > 0 ? [...dropped] : null,
      outcome,
      reason,
    })
    if (prepared.kind === "skip") {
      // A feed with no destination left is a configuration problem, not a verdict on the
      // item: nothing is recorded, the check stops and the next one retries the item.
      if (prepared.reason === "noDestination") {
        throw new FeedPostBlockedError(new Error("noDestination"))
      }
      await this.fenced(feed, leaseUntil, (tx) =>
        socialPostFeedRepository.insertItem(
          ledgerInsert(prepared.outcome, prepared.reason),
          tx,
        ),
      )
      return "invalid"
    }
    const { importedFileId } = prepared
    /** Takes back the picture this attempt imported; no committed post references it. */
    const discardPicture = async (): Promise<void> => {
      if (importedFileId) {
        await discardImportedFile({ fileId: importedFileId, workspaceId })
      }
    }
    const idempotencyKey = `feed:${feed.id}:${await requestHash(item.itemKey)}`
    const refuse = async (reason: string): Promise<"invalid"> => {
      await discardPicture()
      await this.fenced(feed, leaseUntil, (tx) =>
        socialPostFeedRepository.insertItem(
          ledgerInsert("skippedInvalid", reason),
          tx,
        ),
      )
      return "invalid"
    }
    try {
      const afterWrite =
        feed.mode === "queue"
          ? await socialPostScheduleService.prepare({
              // A destination with no posting schedule is auto-spaced, not refused.
              plan: { autoSpacing: true, queue: "next" },
              workspaceId,
            })
          : undefined
      const created = await this.fenced(feed, leaseUntil, async (tx) => {
        const ledger = await socialPostFeedRepository.insertItem(
          ledgerInsert("created", prepared.reason),
          tx,
        )
        if (!ledger) {
          return null
        }
        const post = await socialPostService.createInTx(tx, {
          afterWrite,
          createdById: feed.createdById,
          createdVia: "feed",
          idempotencyKey,
          linkUrl: prepared.linkUrl,
          media: prepared.mediaFileId
            ? [
                {
                  altText: item.title,
                  mediaLibraryFileId: prepared.mediaFileId,
                },
              ]
            : [],
          targets: prepared.targets.map((target) => ({
            destinationId: target.destinationId,
            // Set only when the network's own template differs from the shared text.
            ...(target.text === null ? {} : { text: target.text }),
          })),
          text: prepared.text,
          workspaceId,
        })
        await socialPostFeedRepository.attachPost(
          { id: ledger.id, socialPostId: post.id, workspaceId },
          tx,
        )
        return post.id
      })
      if (!created) {
        // Another worker won the ledger row; the file (stable path) is the one it uses.
        return "duplicate"
      }
      await emitSocialPostChanged({
        socialPostId: created,
        status: feed.mode === "queue" ? "scheduled" : "draft",
        workspaceId,
      })
      return "created"
    } catch (err) {
      const refusal = itemRefusalReason(err)
      if (refusal) {
        return await refuse(refusal)
      }
      if (
        err instanceof ChatbotXException &&
        err.code === IDEMPOTENCY_CONFLICT_CODE
      ) {
        // The post of this item already exists (its ledger row was pruned): record the item so it is not tried again.
        await discardPicture()
        await this.fenced(feed, leaseUntil, (tx) =>
          socialPostFeedRepository.insertItem(
            ledgerInsert("skippedOld", "alreadyPosted", []),
            tx,
          ),
        )
        return "duplicate"
      }
      // No committed post references the file: the next attempt imports it again (a file a concurrent run's post uses is kept; the row lock in discardImportedFile closes that race; only the library row is removed, the object at the stable path is reused by the retry).
      await discardPicture()
      // A refusal that is not about the item's content is the feed's or a destination's problem: nothing is recorded and the check stops.
      throw err instanceof ChatbotXException && err.httpStatusCode < 500
        ? new FeedPostBlockedError(err)
        : err
    }
  }
}

export const socialPostFeedRunner = new SocialPostFeedRunner()
