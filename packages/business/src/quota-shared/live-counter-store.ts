import { db, type PgTable, sql } from "@chatbotx.io/database/client"
import { cacheConnections, distributedStore } from "@chatbotx.io/redis"
import type { PgColumn } from "drizzle-orm/pg-core"
import { logger } from "../logger"

/**
 * The metrics tracked at both quota levels. Lives here (not in a service) so the
 * shared counter store and both owning services agree on the closed set, and a
 * new metric is a single edit that the exhaustive upsert below forces you to map
 * to a column.
 */
export type QuotaMetric =
  | "workspaces"
  | "channels"
  | "teamMembers"
  | "contacts"
  | "mac"

const CACHE_TTL = 60 // seconds

/**
 * Both quota tables name their counter columns `${metric}Used`
 * (`macUsed`, `contactsUsed`, …), so the metric is also the insert-values key
 * stem. Centralized so the store and any reconcile share one convention.
 */
const usedColumnKey = (metric: QuotaMetric): `${QuotaMetric}Used` =>
  `${metric}Used`

/**
 * Parse a Redis live-counter field. Fails CLOSED on a corrupt / non-numeric
 * value by returning `null` (treated by callers as "no usable live value, fall
 * back to the DB"), so a bad counter can never silently coerce to `NaN` and
 * disable a hard limit (`NaN >= limit` is always false).
 */
export function parseLiveCount(value: string | null): number | null {
  if (value === null) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Redis live-counter hash key for a scope id, namespaced by `label`. */
export const liveKeyFor = (label: string, id: string): string =>
  `${label}-live:${id}`

/** Redis row-cache key for a scope id, namespaced by `label`. */
export const cacheKeyFor = (label: string, id: string): string =>
  `${label}:${id}`

export const USER_QUOTA_LABEL = "user-quota"

export interface LiveCounterConfig<TRow> {
  /** Fetch the row for an id from the DB (cold-start seed + reconcile source). */
  fetchRow: (id: string) => Promise<TRow | null>
  /** Read the DB-synced used value off a fetched row (`null` row → 0). */
  getUsed: (row: TRow | null, metric: QuotaMetric) => number
  /** The unique id column used as the upsert conflict target. */
  idColumn: PgColumn
  /** Insert-values key for the id column, e.g. `"userId"` / `"tenantId"`. */
  idKey: string
  /** Log label + Redis key namespace, e.g. `"user-quota"`. */
  label: string
  /** The table the counters live on (insert/upsert target). */
  table: PgTable
  /** metric → its `${metric}Used` Drizzle column, for the SET `+ 1` expression. */
  usedColumns: Record<QuotaMetric, PgColumn>
}

/**
 * Shared Redis-live-counter + row-cache + atomic single-column upsert mechanics
 * for the two quota levels (per-user and pooled-tenant). Owns the parts that
 * were duplicated verbatim between `UserQuotaService` and `TenantQuotaService` —
 * key building, the cold-start-seeded live counter (HINCRBY), the row cache, and
 * the dynamic per-metric upsert — so a fix or a new metric lands in one place
 * with one exhaustive guard. Decision logic (limits, default-plan overlay,
 * access state, owner delegation) stays in the owning services.
 */
export class LiveCounterStore<TRow> {
  private readonly config: LiveCounterConfig<TRow>

  constructor(config: LiveCounterConfig<TRow>) {
    this.config = config
  }

  cacheKey(id: string): string {
    return cacheKeyFor(this.config.label, id)
  }

  liveKey(id: string): string {
    return liveKeyFor(this.config.label, id)
  }

  /**
   * Live counter for `metric`, cold-started from the DB row so HINCRBY never
   * begins at 0 for an existing scope. Returns the DB value on any Redis error
   * or corrupt field (fail closed via {@link parseLiveCount}).
   */
  async getLiveCount(id: string, metric: QuotaMetric): Promise<number> {
    try {
      const client = await cacheConnections.useExisting()
      const field = metric
      const key = this.liveKey(id)

      const live = parseLiveCount(await client.hget(key, field))
      if (live !== null) {
        return live
      }

      // Cold start (or corrupt field): seed from the DB so the counter resumes
      // from the authoritative value rather than 0.
      const dbValue = this.config.getUsed(
        await this.config.fetchRow(id),
        metric,
      )
      await client.hsetnx(key, field, String(dbValue))

      const seeded = parseLiveCount(await client.hget(key, field))
      return seeded ?? dbValue
    } catch (err) {
      logger.warn(
        { err },
        `${this.config.label}: getLiveCount failed, falling back to DB`,
      )
      return this.config.getUsed(await this.config.fetchRow(id), metric)
    }
  }

  /**
   * Near-real-time live counts for every metric in one round-trip. A single
   * HMGET reads all `${QuotaMetric}` fields; any field that is missing or
   * corrupt (cold start) is cold-seeded from a SINGLE DB row fetch and resolved
   * to that row's DB value, so the result is always at least as fresh as the DB
   * column. Returns the DB values for all metrics on any Redis error (fail
   * closed via {@link parseLiveCount}). Unlike {@link getLiveCount} this never
   * fetches the row more than once, making it cheap on the usage-display path.
   *
   * Cold-seeding uses `hsetnx`, so a concurrent in-flight increment is never
   * clobbered; in the rare race the display value can trail the live counter by
   * the racing event for one read and self-corrects on the next.
   */
  async getLiveCounts(id: string): Promise<Record<QuotaMetric, number>> {
    const metrics = Object.keys(this.config.usedColumns) as QuotaMetric[]
    try {
      const client = await cacheConnections.useExisting()
      const key = this.liveKey(id)

      const raw = await client.hmget(key, ...metrics)
      const live = metrics.map((_, i) => parseLiveCount(raw[i] ?? null))

      if (live.every((value) => value !== null)) {
        return this.toUsedRecord(metrics, live as number[])
      }

      // Cold start (or a corrupt field): seed the missing fields from one DB
      // row fetch so each counter resumes from the authoritative value.
      const row = await this.config.fetchRow(id)
      const result = {} as Record<QuotaMetric, number>
      for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i] as QuotaMetric
        const value = live[i]
        if (value !== null) {
          result[metric] = value
          continue
        }
        const dbValue = this.config.getUsed(row, metric)
        await client.hsetnx(key, metric, String(dbValue))
        result[metric] = dbValue
      }
      return result
    } catch (err) {
      logger.warn(
        { err },
        `${this.config.label}: getLiveCounts failed, falling back to DB`,
      )
      const row = await this.config.fetchRow(id)
      return this.toUsedRecord(
        metrics,
        metrics.map((metric) => this.config.getUsed(row, metric)),
      )
    }
  }

  private toUsedRecord(
    metrics: QuotaMetric[],
    values: number[],
  ): Record<QuotaMetric, number> {
    const result = {} as Record<QuotaMetric, number>
    for (let i = 0; i < metrics.length; i++) {
      result[metrics[i] as QuotaMetric] = values[i] as number
    }
    return result
  }

  async getCachedRow(id: string): Promise<TRow | null> {
    try {
      return await distributedStore.get<TRow>(this.cacheKey(id))
    } catch (err) {
      logger.warn(
        { err },
        `${this.config.label}: Redis read failed, falling back to DB`,
      )
      return null
    }
  }

  async putCachedRow(id: string, row: TRow): Promise<void> {
    try {
      await distributedStore.put(this.cacheKey(id), row, CACHE_TTL)
    } catch (err) {
      logger.warn(
        { err },
        `${this.config.label}: Redis write failed, continuing without cache`,
      )
    }
  }

  async invalidate(id: string): Promise<void> {
    try {
      await distributedStore.delete(this.cacheKey(id))
    } catch (err) {
      logger.warn(
        { err },
        `${this.config.label}: Redis delete failed, stale cache may persist until TTL`,
      )
    }
  }

  /** Increment the live counter (cold-seeding first so it starts from the DB base). */
  async incrementBy(
    id: string,
    metric: QuotaMetric,
    count: number,
  ): Promise<void> {
    if (count <= 0) {
      return
    }
    try {
      const client = await cacheConnections.useExisting()
      await this.getLiveCount(id, metric)
      await client.hincrby(this.liveKey(id), metric, count)
    } catch (err) {
      logger.warn(
        { err },
        `${this.config.label}: Redis increment failed for ${metric}, counter will reconcile on next sync`,
      )
    }
  }

  /** Persist a +1 usage increment to the DB row. {@link upsertMetricBy} by 1. */
  async upsertMetric(id: string, metric: QuotaMetric): Promise<void> {
    await this.upsertMetricBy(id, metric, 1)
  }

  /**
   * Persist a `+count` usage increment for `metric` to the DB row
   * (insert-or-update), targeting the single `${metric}Used` column. Throws on
   * an unmapped metric rather than silently incrementing the wrong column, and
   * on a non-positive `count` rather than writing a no-op / negative seed.
   */
  async upsertMetricBy(
    id: string,
    metric: QuotaMetric,
    count: number,
  ): Promise<void> {
    if (count <= 0) {
      return
    }
    const column = this.config.usedColumns[metric]
    if (!column) {
      throw new Error(`Unhandled quota metric: ${String(metric)}`)
    }
    const usedKey = usedColumnKey(metric)

    // The values/set keys are dynamic (one of five fixed `${metric}Used`
    // columns), so this single localized cast bridges the generic store to
    // Drizzle's per-table insert typing. The column set is closed and validated
    // above, so the runtime shape is always a valid row fragment.
    const values = {
      [this.config.idKey]: id,
      [usedKey]: count,
      syncedAt: new Date(),
    } as Record<string, unknown>

    await db
      .insert(this.config.table)
      .values(values as never)
      .onConflictDoUpdate({
        target: this.config.idColumn,
        set: {
          [usedKey]: sql`${column} + ${count}`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        } as never,
      })
  }

  /**
   * Write-through a `+count` consumption to BOTH stores so every reader agrees:
   * the authoritative DB `${metric}Used` column AND the Redis live counter, then
   * busts the row cache. This is the single place that keeps the two stores in
   * lockstep — the historical split (DB-only `consume` vs. Redis-only
   * `incrementBy`) let the display and the gate read different numbers until the
   * scheduled reconcile.
   *
   * The live increment runs first: it cold-seeds the counter from the CURRENT DB
   * row before applying `+count`, so seeding then bumping the DB would otherwise
   * double-count a cold counter. The live step is best-effort (swallowed on a
   * Redis error, re-grounded on the next reconcile); the DB upsert is
   * authoritative and a real failure throws and surfaces to the caller — so a
   * Redis outage can never lose a durable count.
   */
  async consume(id: string, metric: QuotaMetric, count = 1): Promise<void> {
    if (count <= 0) {
      return
    }
    await this.incrementBy(id, metric, count)
    await this.upsertMetricBy(id, metric, count)
    await this.invalidate(id)
  }
}
