/**
 * A minimal in-memory stand-in for a drizzle transaction, enough for the
 * template sync handlers: `select().from(model).where().for().limit()`,
 * `query.<name>.findMany`, and recorded `update`/`insert`/`delete`. Tables are
 * keyed by the `table` property of the (mocked) schema model.
 */
type Row = Record<string, unknown>

export type FakeCall = {
  op: "update" | "insert" | "delete"
  table: string
  set?: Row
  values?: Row[]
  where?: unknown
}

const matches = (row: Row, where: Row | undefined): boolean =>
  Object.entries(where ?? {}).every(([key, expected]) => {
    if (expected === undefined) {
      return true
    }
    if (typeof expected === "object" && expected !== null && "in" in expected) {
      return (expected as { in: unknown[] }).in.includes(row[key])
    }
    return row[key] === expected
  })

export const makeFakeTx = (
  tables: Record<string, Row[]>,
  queryNames: Record<string, string>,
) => {
  const calls: FakeCall[] = []
  const rowsOf = (table: string) => tables[table] ?? []
  const select = () => ({
    from: (model: { table: string }) => {
      const query = {
        where: () => query,
        for: () => query,
        limit: () => Promise.resolve(rowsOf(model.table).slice(0, 1)),
      }
      return query
    },
  })
  const query = Object.fromEntries(
    Object.entries(queryNames).map(([name, table]) => [
      name,
      {
        findMany: (args?: { where?: Row }) =>
          Promise.resolve(
            rowsOf(table).filter((row) => matches(row, args?.where)),
          ),
      },
    ]),
  )
  const tx = {
    select,
    query,
    update: (model: { table: string }) => ({
      set: (set: Row) => ({
        where: (where: unknown) => {
          calls.push({ op: "update", table: model.table, set, where })
          return Promise.resolve()
        },
      }),
    }),
    insert: (model: { table: string }) => ({
      values: (values: Row | Row[]) => {
        calls.push({
          op: "insert",
          table: model.table,
          values: Array.isArray(values) ? values : [values],
        })
        return Promise.resolve()
      },
    }),
    delete: (model: { table: string }) => ({
      where: (where: unknown) => {
        calls.push({ op: "delete", table: model.table, where })
        return Promise.resolve()
      },
    }),
  }
  return { tx: tx as never, calls }
}

export const callsOn = (
  calls: readonly FakeCall[],
  op: FakeCall["op"],
  table: string,
) => calls.filter((call) => call.op === op && call.table === table)
