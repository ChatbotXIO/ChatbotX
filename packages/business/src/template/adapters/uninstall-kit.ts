import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  TemplateResourceKind,
  TemplateUninstallEffect,
} from "@chatbotx.io/database/partials"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import {
  findParentsWithOutsideDependents,
  type InboundParentKind,
} from "../uninstall-references"
import type {
  FrozenFlags,
  ResourceUninstallHandler,
  TemplateUninstallContext,
  TemplateUninstallDeleteResult,
} from "./types"

/** Bounded child deletes: one batch is at most this many rows. */
export const UNINSTALL_DRAIN_BATCH = 500

type WorkspaceTable = PgTable & {
  id: PgColumn
  workspaceId: PgColumn
}

export const effect = (
  name: string,
  args: TemplateUninstallEffect["args"] = {},
): TemplateUninstallEffect => ({ name, args })

/** The same effects for every id of the batch: the cache and event effects. */
export const sameEffects = (
  ids: readonly string[],
  effects: readonly TemplateUninstallEffect[],
): ReadonlyMap<string, readonly TemplateUninstallEffect[]> =>
  new Map(ids.map((id) => [id, effects] as const))

/**
 * Splits `ids` into deleted and absent from what a service's `deleteInTx`
 * core returned. `RETURNING` is the source of truth, so a row deleted
 * concurrently counts as absent, never as a failure.
 */
export const deleteResult = (
  ids: readonly string[],
  deleted: readonly string[],
  effects: (
    deleted: readonly string[],
  ) => TemplateUninstallDeleteResult["effects"] = () => new Map(),
): TemplateUninstallDeleteResult => {
  const gone = new Set(deleted)
  return {
    deleted: [...deleted],
    absent: ids.filter((id) => !gone.has(id)),
    effects: effects(deleted),
  }
}

type FlagTable = WorkspaceTable

const flagColumn = (table: FlagTable, key: string): PgColumn =>
  (table as unknown as Record<string, PgColumn>)[key]

/**
 * Producers stop first: sets `key` to its frozen value on the rows and returns
 * each row's prior value (read in the same transaction, before the update).
 */
export const freezeFlag = async (
  tx: DatabaseClient,
  table: FlagTable,
  flag: { key: string; frozen: boolean },
  input: { workspaceId: string; ids: readonly string[] },
): Promise<ReadonlyMap<string, FrozenFlags>> => {
  if (input.ids.length === 0) {
    return new Map()
  }
  const where = and(
    eq(table.workspaceId, input.workspaceId),
    inArray(table.id, [...input.ids]),
  )
  const prior = await tx
    .select({ id: table.id, value: flagColumn(table, flag.key) })
    .from(table)
    .where(where)
  await tx
    .update(table)
    .set({ [flag.key]: flag.frozen } as never)
    .where(where)
  return new Map(
    prior.map((row) => [String(row.id), { [flag.key]: row.value }] as const),
  )
}

/** Restores the stored prior value, only where the flag still has the frozen value. */
export const unfreezeFlag = async (
  tx: DatabaseClient,
  table: FlagTable,
  flag: { key: string; frozen: boolean },
  rows: readonly { resourceId: string; frozenFrom: FrozenFlags | null }[],
  workspaceId: string,
  effectsFor: () => readonly TemplateUninstallEffect[] = () => [],
): Promise<ReadonlyMap<string, readonly TemplateUninstallEffect[]>> => {
  const byPrior = Map.groupBy(
    rows.filter(
      (row) =>
        row.frozenFrom !== null && row.frozenFrom[flag.key] !== undefined,
    ),
    (row) => Boolean(row.frozenFrom?.[flag.key]),
  )
  const restored: string[] = []
  for (const [value, group] of byPrior) {
    if (value === flag.frozen) {
      continue
    }
    const updated = await tx
      .update(table)
      .set({ [flag.key]: value } as never)
      .where(
        and(
          eq(table.workspaceId, workspaceId),
          inArray(
            table.id,
            group.map((row) => row.resourceId),
          ),
          eq(flagColumn(table, flag.key), flag.frozen),
        ),
      )
      .returning({ id: table.id })
    restored.push(...updated.map((row) => String(row.id)))
  }
  return new Map(restored.map((id) => [id, effectsFor()] as const))
}

/** The freeze / unfreeze pair of a kind with one producer flag. */
export const flagHandlers = (
  table: FlagTable,
  flag: { key: string; frozen: boolean },
  effectsFor?: (workspaceId: string) => readonly TemplateUninstallEffect[],
): Pick<ResourceUninstallHandler, "freeze" | "unfreeze" | "freezeEffects"> => ({
  freezeEffects: effectsFor,
  freeze: async (tx, ids, ctx) =>
    await freezeFlag(tx, table, flag, { workspaceId: ctx.workspaceId, ids }),
  unfreeze: async (tx, rows, ctx) =>
    await unfreezeFlag(
      tx,
      table,
      flag,
      rows,
      ctx.workspaceId,
      effectsFor ? () => effectsFor(ctx.workspaceId) : undefined,
    ),
})

export const noFreeze: ResourceUninstallHandler["freeze"] = async () =>
  await Promise.resolve(new Map())

export const noUnfreeze: ResourceUninstallHandler["unfreeze"] = async () =>
  await Promise.resolve(new Map())

/** The context every uninstall handler call receives for one installation and kind. */
export const uninstallContext = (
  tx: DatabaseClient,
  workspaceId: string,
  installationId: string,
  kind: TemplateResourceKind,
): TemplateUninstallContext => ({
  tx,
  workspaceId,
  kind,
  installationId,
  installationIds: [installationId],
})

export const noDependents: ResourceUninstallHandler["protectedDependents"] =
  async () => await Promise.resolve(new Set<string>())

/** `protectedDependents` for a kind with column references listed in `INBOUND_PROBES`. */
export type ProbedDependents =
  ResourceUninstallHandler["protectedDependents"] & {
    /** Which parent kind's registry slots and column slots this handler probes. */
    readonly probedKind: InboundParentKind
  }

/** Marks a dependents check as the slot probe (a test asserts every referenced kind has one). */
export const withProbedKind = (
  kind: InboundParentKind,
  check: ResourceUninstallHandler["protectedDependents"],
): ProbedDependents => Object.assign(check, { probedKind: kind })

export const probedDependents = (kind: InboundParentKind): ProbedDependents =>
  withProbedKind(
    kind,
    async (tx, ids, deletingSet, scope) =>
      await findParentsWithOutsideDependents(tx, kind, ids, deletingSet, scope),
  )

/**
 * Deletes one bounded batch of child rows of `parentIds`, scoped by workspace
 * so a partitioned table prunes to its partition. A table with a primary key
 * given is matched on its tuple (needed for partitioned tables); any other
 * uses `ctid`. Returns true when the batch was full, i.e. more may remain.
 */
export const deleteChildBatch = async (
  tx: DatabaseClient,
  input: {
    table: string
    parentColumn: string
    parentIds: readonly string[]
    workspaceId: string
    primaryKey?: readonly string[]
  },
): Promise<boolean> => {
  if (input.parentIds.length === 0) {
    return false
  }
  const table = sql.identifier(input.table)
  const parents = sql.join(
    input.parentIds.map((id) => sql`${id}::bigint`),
    sql`, `,
  )
  const key = input.primaryKey
    ? sql.join(
        input.primaryKey.map((column) => sql.identifier(column)),
        sql`, `,
      )
    : sql`ctid`
  const result = await tx.execute(
    sql`DELETE FROM ${table} WHERE (${key}) IN (
          SELECT ${key} FROM ${table}
          WHERE "workspaceId" = ${input.workspaceId}::bigint
            AND ${sql.identifier(input.parentColumn)} IN (${parents})
          LIMIT ${UNINSTALL_DRAIN_BATCH})`,
  )
  return (result.rowCount ?? 0) >= UNINSTALL_DRAIN_BATCH
}

/** Soft-deletes one bounded batch of live child rows (`deletedAt`), by workspace. */
export const softDeleteChildBatch = async (
  tx: DatabaseClient,
  input: {
    table: string
    parentColumn: string
    parentIds: readonly string[]
    workspaceId: string
  },
): Promise<boolean> => {
  if (input.parentIds.length === 0) {
    return false
  }
  const table = sql.identifier(input.table)
  const parents = sql.join(
    input.parentIds.map((id) => sql`${id}::bigint`),
    sql`, `,
  )
  const result = await tx.execute(
    sql`UPDATE ${table} SET "deletedAt" = now() WHERE ctid IN (
          SELECT ctid FROM ${table}
          WHERE "workspaceId" = ${input.workspaceId}::bigint
            AND ${sql.identifier(input.parentColumn)} IN (${parents})
            AND "deletedAt" IS NULL
          LIMIT ${UNINSTALL_DRAIN_BATCH})`,
  )
  return (result.rowCount ?? 0) >= UNINSTALL_DRAIN_BATCH
}

/** Runs the drains in order; true as soon as one still has rows (the parent waits a round). */
export const drainInOrder = async (
  steps: readonly (() => Promise<boolean>)[],
): Promise<boolean> => {
  for (const step of steps) {
    if (await step()) {
      return true
    }
  }
  return false
}
