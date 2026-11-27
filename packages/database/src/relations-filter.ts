import {
  relationsFilterToSQL as drizzleRelationsFilterToSQL,
  SQL,
} from "drizzle-orm"

// drizzle-orm 1.0.0-rc throws on an `undefined` filter value ("Use
// 'EmptyFilter'…"); beta skipped it, and callers build `where` objects with
// optional keys (`ids: input.ids`). Drop them so the filter keeps beta semantics.
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripUndefined)
  }
  if (!isPlainObject(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefined(entry)]),
  )
}

type DrizzleArgs = Parameters<typeof drizzleRelationsFilterToSQL>

/**
 * drizzle-orm 1.0.0-rc returns `{ sql: SQLChunk[] | undefined, … }` from
 * `relationsFilterToSQL`; every repository and service still wants the
 * `SQL | undefined` it returned before. Keep that contract in one place.
 * Side-effect free (no pool), so query builders can import it.
 */
export function relationsFilterToSQL(
  table: DrizzleArgs[0],
  filter: DrizzleArgs[1],
  ...internals: [
    tableRelations?: DrizzleArgs[2],
    tablesRelations?: DrizzleArgs[3],
    withSubqueries?: DrizzleArgs[4],
  ]
): SQL | undefined {
  const built = (
    drizzleRelationsFilterToSQL as (...args: unknown[]) => {
      sql: ConstructorParameters<typeof SQL>[0] | undefined
    }
  )(table, stripUndefined(filter), ...internals)

  return built.sql ? new SQL(built.sql) : undefined
}
