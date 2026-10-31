import { type DatabaseClient, db, sql } from "../../client"

/** The registry's reference slots that point at one parent kind (business owns the registries). */
export type ReferenceSlots = {
  scalars: string[]
  arrays: string[]
  prefixes: string[]
  conditionTypes: string[]
}

/** One column that holds the id of a parent (an FK or a plain id column). */
export type ReferenceColumnProbe = {
  /** The tracked kind of the holder, or null for installer data an install never creates. */
  holderKind: string | null
  table: string
  column: string
  /** The column that is the holder's own id (the row's `id` by default). */
  holderIdColumn: string
  workspaceColumn?: string
  /** The column is text, not bigint (`Condition.sourceId`). */
  textColumn?: boolean
}

/** A table whose JSON columns embed ids under the registry's field names. */
export type ReferenceContainerProbe = {
  holderKind: string | null
  table: string
  holderIdColumn: string
  jsonColumns: readonly string[]
  workspaceColumn?: string
  /** No workspace column: scoped through the live broadcast the row belongs to. */
  scopeThroughBroadcast?: boolean
  /** Condition rows carry their contact-filter field in this column. */
  conditionTypeColumn?: string
  /** The (single) JSON column is a contact filter `{ operator, conditions: [{ field, value }] }`. */
  contactFilterColumn?: string
  /** Static registry predicate on the holding row (trusted constant, never user input). */
  restrictSql?: string
}

/** One reference: `parent` is pointed at by `holderId` (null for installer data, whose id is irrelevant). */
export type InboundEdge = {
  parent: string
  holderKind: string | null
  holderId: string | null
}

type EdgeRow = { parent: string; holder_id?: string | null }

const NUMERIC_ID = /^\d+$/

/** Ids are numeric bigints: anything else would be a bug upstream, and must not reach a regex. */
const assertNumeric = (ids: readonly string[]): void => {
  for (const id of ids) {
    if (!NUMERIC_ID.test(id)) {
      throw new TypeError(`Non-numeric id in a reference probe: ${id}`)
    }
  }
}

/** Typed `bigint` parameters, so the planner uses the FK index instead of casting every row. */
const bigintList = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::bigint`),
    sql`, `,
  )

const textList = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )

/** One regex alternation of every id, longest first so `12` is not cut short by `1`. */
const idAlternation = (ids: readonly string[]): string =>
  [...ids].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).join("|")

/**
 * A Condition row has no workspace of its own: its trigger or webhook has.
 * Scoped by the owner id lists (index-served by the FK indexes) rather than a
 * per-row EXISTS, so the regex only ever reads this workspace's conditions.
 */
const scopedConditions = (workspaceId: string) =>
  sql`(SELECT c.* FROM "Condition" c
        WHERE c."triggerId" IN (SELECT tr."id" FROM "Trigger" tr WHERE tr."workspaceId" = ${workspaceId}::bigint)
       UNION ALL
       SELECT c.* FROM "Condition" c
        WHERE c."webhookId" IN (SELECT wh."id" FROM "Webhook" wh WHERE wh."workspaceId" = ${workspaceId}::bigint)
      )`

const toEdges = (
  rows: readonly EdgeRow[],
  holderKind: string | null,
): InboundEdge[] =>
  rows.map((row) => ({
    parent: String(row.parent),
    holderKind,
    holderId: row.holder_id == null ? null : String(row.holder_id),
  }))

/** The holder-id select: installer data never needs one. */
const holderSelect = (
  holderKind: string | null,
  expression: ReturnType<typeof sql>,
) => (holderKind ? sql`${expression}::text` : sql`NULL::text`)

const findColumnEdges = async (
  tx: DatabaseClient,
  probe: ReferenceColumnProbe,
  parentIds: readonly string[],
  workspaceId: string,
): Promise<InboundEdge[]> => {
  const isConditionTable = probe.table === "Condition"
  const from = isConditionTable
    ? sql`${scopedConditions(workspaceId)} AS t`
    : sql`${sql.identifier(probe.table)} AS t`
  const column = sql`t.${sql.identifier(probe.column)}`
  const ids = probe.textColumn ? textList(parentIds) : bigintList(parentIds)
  const workspace =
    probe.workspaceColumn && !isConditionTable
      ? sql`AND t.${sql.identifier(probe.workspaceColumn)} = ${workspaceId}::bigint`
      : sql``
  // The trigger-source column of a condition only counts for `type = 'trigger'` rows.
  const conditionOnly =
    isConditionTable && probe.column === "sourceId"
      ? sql`AND t."type" = 'trigger'`
      : sql``
  // A holder of a tracked kind never counts against itself (a row naming its own id).
  const selfReference = probe.holderKind
    ? sql`AND t.${sql.identifier(probe.holderIdColumn)}::text IS DISTINCT FROM ${column}::text`
    : sql``
  const holderId = holderSelect(
    probe.holderKind,
    sql`t.${sql.identifier(probe.holderIdColumn)}`,
  )
  const result = await tx.execute<EdgeRow>(
    sql`SELECT DISTINCT ${column}::text AS parent, ${holderId} AS holder_id
        FROM ${from}
        WHERE ${column} IN (${ids})
        ${workspace} ${conditionOnly} ${selfReference}`,
  )
  return toEdges(result.rows, probe.holderKind)
}

/** The FROM and WHERE of a container's holding rows, scoped to the workspace. */
const containerSource = (
  container: ReferenceContainerProbe,
  workspaceId: string,
) => {
  const restrict = container.restrictSql
    ? sql`AND ${sql.raw(container.restrictSql)}`
    : sql``
  if (container.workspaceColumn) {
    return {
      from: sql`${sql.identifier(container.table)} AS t`,
      where: sql`t.${sql.identifier(container.workspaceColumn)} = ${workspaceId}::bigint ${restrict}`,
    }
  }
  if (container.scopeThroughBroadcast) {
    return {
      from: sql`${sql.identifier(container.table)} AS t`,
      where: sql`EXISTS (SELECT 1 FROM "Broadcast" bc WHERE bc."id" = t."broadcastId" AND bc."workspaceId" = ${workspaceId}::bigint AND bc."deletedAt" IS NULL) ${restrict}`,
    }
  }
  return {
    from: sql`${scopedConditions(workspaceId)} AS t`,
    where: sql`TRUE ${restrict}`,
  }
}

/**
 * The JSON text of a holder: its columns with backslashes removed, so
 * `jsonb[]` and `text[]` array literals read like plain JSON.
 */
const holderText = (columns: readonly string[]) =>
  sql.join(
    columns.map(
      (column) => sql`replace(t.${sql.identifier(column)}::text, E'\\\\', '')`,
    ),
    sql` || ' ' || `,
  )

/**
 * Every id of the container in ONE statement: the text of each holding row is
 * scanned once with a single regex alternation per slot shape, the matched id
 * is returned and the caller maps it back to the parent. Scalar slots match
 * `"field": "ID"`, array slots `"field": [..."ID"...]` (the array body is
 * matched first, then its ids), prefixes `prefix:ID`.
 */
const findFieldEdges = async (
  tx: DatabaseClient,
  container: ReferenceContainerProbe,
  slots: ReferenceSlots,
  parentIds: readonly string[],
  workspaceId: string,
): Promise<InboundEdge[]> => {
  const source = containerSource(container, workspaceId)
  const alternation = idAlternation(parentIds)
  const holder = holderSelect(
    container.holderKind,
    sql`t.${sql.identifier(container.holderIdColumn)}`,
  )
  const selfExclusion = container.holderKind
    ? sql`AND t.${sql.identifier(container.holderIdColumn)}::text <> m[1]`
    : sql``

  const conditionOnly = container.conditionTypeColumn
    ? sql`AND t.${sql.identifier(container.conditionTypeColumn)} IN (${textList(slots.conditionTypes)})`
    : sql``
  const text = holderText(container.jsonColumns)

  const patterns: string[] = container.conditionTypeColumn
    ? [`"(${alternation})"`]
    : []
  if (!container.conditionTypeColumn) {
    if (slots.scalars.length > 0) {
      patterns.push(`"(?:${slots.scalars.join("|")})": ?"(${alternation})"`)
    }
    if (slots.prefixes.length > 0) {
      patterns.push(
        `(?:^|[^A-Za-z0-9])(?:${slots.prefixes.join("|")}):(${alternation})(?=[^0-9]|$)`,
      )
    }
  }
  const statements = patterns.map(
    (pattern) =>
      sql`SELECT DISTINCT m[1] AS parent, ${holder} AS holder_id
          FROM ${source.from}, LATERAL regexp_matches(${text}, ${pattern}, 'g') AS m
          WHERE ${source.where} ${conditionOnly} ${selfExclusion}`,
  )
  if (!container.conditionTypeColumn && slots.arrays.length > 0) {
    const arrayPattern = `"(?:${slots.arrays.join("|")})": ?\\[([^\\]]*)\\]`
    statements.push(
      sql`SELECT DISTINCT m[1] AS parent, ${holder} AS holder_id
          FROM ${source.from},
               LATERAL regexp_matches(${text}, ${arrayPattern}, 'g') AS body,
               LATERAL regexp_matches(body[1], ${`"(${alternation})"`}, 'g') AS m
          WHERE ${source.where} ${selfExclusion}`,
    )
  }
  if (statements.length === 0) {
    return []
  }
  const result = await tx.execute<EdgeRow>(
    sql.join(
      statements.map((statement) => sql`(${statement})`),
      sql` UNION `,
    ),
  )
  return toEdges(result.rows, container.holderKind)
}

/** A contact-filter column: only the id-valued conditions of the probed kind are matched, on their `value`. */
const findContactFilterEdges = async (
  tx: DatabaseClient,
  container: ReferenceContainerProbe,
  slots: ReferenceSlots,
  parentIds: readonly string[],
  workspaceId: string,
): Promise<InboundEdge[]> => {
  if (!container.contactFilterColumn || slots.conditionTypes.length === 0) {
    return []
  }
  const source = containerSource(container, workspaceId)
  const filter = sql`t.${sql.identifier(container.contactFilterColumn)}`
  const holder = holderSelect(
    container.holderKind,
    sql`t.${sql.identifier(container.holderIdColumn)}`,
  )
  const pattern = `"(${idAlternation(parentIds)})"`
  const result = await tx.execute<EdgeRow>(
    sql`SELECT DISTINCT m[1] AS parent, ${holder} AS holder_id
        FROM ${source.from},
             LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(${filter}->'conditions') = 'array'
                    THEN ${filter}->'conditions' ELSE '[]'::jsonb END
             ) AS c,
             LATERAL regexp_matches(replace((c->'value')::text, E'\\\\', ''), ${pattern}, 'g') AS m
        WHERE ${source.where}
          AND c->>'field' IN (${textList(slots.conditionTypes)})`,
  )
  return toEdges(result.rows, container.holderKind)
}

/**
 * The raw reference probes of an uninstall. The registries (which columns and
 * JSON fields can point at a copied kind) stay in business; this holds the SQL.
 */
export const templateUninstallReferenceRepository = {
  /**
   * Every reference to one of `parentIds` as an edge: one statement per column
   * slot and per JSON container however many ids are probed, scoped to the
   * workspace through indexed owner lists. The holder's identity is returned so
   * the caller can decide in memory, once, which holders are outside a deleting
   * set (and repeat the closure without asking the database again).
   */
  async findInboundEdges(
    input: {
      workspaceId: string
      parentIds: readonly string[]
      columnProbes: readonly ReferenceColumnProbe[]
      containerProbes: readonly ReferenceContainerProbe[]
      slots: ReferenceSlots
    },
    tx: DatabaseClient = db,
  ): Promise<InboundEdge[]> {
    if (input.parentIds.length === 0) {
      return []
    }
    assertNumeric(input.parentIds)
    const edges: InboundEdge[] = []
    for (const probe of input.columnProbes) {
      edges.push(
        ...(await findColumnEdges(
          tx,
          probe,
          input.parentIds,
          input.workspaceId,
        )),
      )
    }
    for (const container of input.containerProbes) {
      if (container.contactFilterColumn) {
        edges.push(
          ...(await findContactFilterEdges(
            tx,
            container,
            input.slots,
            input.parentIds,
            input.workspaceId,
          )),
        )
        continue
      }
      if (
        container.conditionTypeColumn &&
        input.slots.conditionTypes.length === 0
      ) {
        continue
      }
      edges.push(
        ...(await findFieldEdges(
          tx,
          container,
          input.slots,
          input.parentIds,
          input.workspaceId,
        )),
      )
    }
    return edges
  },
}
