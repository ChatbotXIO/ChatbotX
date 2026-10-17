import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  COUNT_SQL,
  LIST_CHUNKS_SQL,
  run,
  SUPPORTED_LANGUAGES,
  UPDATE_SQL,
} from "../scripts/backfill-contact-event-attributes.mjs"

const EXTRA_PARAMETER = /\$[5-9]/

type Chunk = {
  chunk_schema: string
  chunk_name: string
  range_start: Date
  range_end: Date
  is_compressed: boolean
}

const chunk = (name: string, isCompressed: boolean, day: number): Chunk => ({
  chunk_schema: "_timescaledb_internal",
  chunk_name: name,
  range_start: new Date(Date.UTC(2026, 0, day)),
  range_end: new Date(Date.UTC(2026, 0, day + 1)),
  is_compressed: isCompressed,
})

/** A pg-like pool recording every statement, with per-statement overrides. */
function fakePool(
  chunks: Chunk[],
  options: { updateRows?: number; failOn?: (sql: string) => boolean } = {},
) {
  const statements: { sql: string; params?: unknown[] }[] = []
  const query = vi.fn((sql: string, params?: unknown[]) => {
    statements.push({ sql, params })
    if (options.failOn?.(sql)) {
      return Promise.reject(new Error("boom"))
    }
    if (sql === LIST_CHUNKS_SQL) {
      return Promise.resolve({ rows: chunks })
    }
    if (sql === COUNT_SQL) {
      return Promise.resolve({ rows: [{ count: options.updateRows ?? 0 }] })
    }
    if (sql === UPDATE_SQL) {
      return Promise.resolve({ rowCount: options.updateRows ?? 0, rows: [] })
    }
    return Promise.resolve({ rows: [] })
  })
  const release = vi.fn()
  const connect = vi.fn(() => Promise.resolve({ query, release }))
  return { pool: { query, connect }, statements, release }
}

const sqlOf = (statements: { sql: string }[]) =>
  statements.map((statement) => statement.sql.trim().split("\n")[0])

describe("backfill-contact-event-attributes SQL", () => {
  test("only fills contact_created rows from an exact ContactInbox join in the same workspace", () => {
    expect(UPDATE_SQL).toContain(`e."eventType" = 'contact_created'`)
    expect(UPDATE_SQL).toContain(`ci.id = e."contactId"`)
    expect(UPDATE_SQL).toContain(`c."workspaceId" = e."workspaceId"`)
  })

  test("never overwrites a value that is already there", () => {
    expect(UPDATE_SQL).toContain(`COALESCE(e."inboxId", ci."inboxId")`)
    expect(UPDATE_SQL).toContain(`e."language",`)
    expect(UPDATE_SQL).toContain(`e."inboxId" IS NULL`)
    expect(UPDATE_SQL).toContain(`e."language" IS NULL`)
  })

  test("only copies a supported base language, like the live emitters", () => {
    expect(UPDATE_SQL).toContain("= ANY($4::text[])")
    expect(UPDATE_SQL).toContain("split_part(")
    expect(SUPPORTED_LANGUAGES).toContain("en")
    expect(SUPPORTED_LANGUAGES).not.toContain("en_US")
  })

  test("binds the window and the workspace as parameters", () => {
    expect(UPDATE_SQL).toContain(`e."occurredAt" >= $1`)
    expect(UPDATE_SQL).toContain(`e."occurredAt" < $2`)
    expect(UPDATE_SQL).toContain("$3::bigint IS NULL")
    expect(UPDATE_SQL).not.toMatch(EXTRA_PARAMETER)
  })

  test("the dry-run count uses exactly the same predicate as the update", () => {
    const predicate = (sql: string) => sql.slice(sql.indexOf("WHERE"))
    expect(predicate(COUNT_SQL)).toBe(predicate(UPDATE_SQL))
  })
})

describe("backfill-contact-event-attributes run", () => {
  const log = vi.fn()

  beforeEach(() => {
    log.mockReset()
  })

  test("walks the chunks oldest first and updates each in its own transaction", async () => {
    const { pool, statements } = fakePool(
      [
        chunk("_hyper_1_1_chunk", false, 1),
        chunk("_hyper_1_2_chunk", false, 2),
      ],
      { updateRows: 5 },
    )

    const result = await run({ pool, dryRun: false, workspaceId: null, log })

    expect(result).toEqual({ total: 10, recompressFailures: 0 })
    expect(sqlOf(statements).filter((sql) => sql === "BEGIN")).toHaveLength(2)
    expect(sqlOf(statements).filter((sql) => sql === "COMMIT")).toHaveLength(2)
    const updates = statements.filter((s) => s.sql === UPDATE_SQL)
    expect(updates.map((s) => s.params?.[0])).toEqual([
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 0, 2)),
    ])
  })

  test("sets a lock timeout inside every transaction", async () => {
    const { pool, statements } = fakePool(
      [chunk("_hyper_1_1_chunk", false, 1)],
      {
        updateRows: 1,
      },
    )

    await run({ pool, dryRun: false, workspaceId: null, log })

    expect(sqlOf(statements)).toContain("SET LOCAL lock_timeout = 5000")
  })

  test("decompresses a compressed chunk before the update and compresses it again after", async () => {
    const { pool, statements } = fakePool(
      [chunk("_hyper_1_1_chunk", true, 1)],
      {
        updateRows: 3,
      },
    )

    await run({ pool, dryRun: false, workspaceId: null, log })

    const order = sqlOf(statements)
    const decompress = order.findIndex((sql) =>
      sql.includes("decompress_chunk"),
    )
    const update = order.findIndex((sql) => sql.startsWith("UPDATE"))
    const compress = order.findIndex(
      (sql) => sql.includes("compress_chunk") && !sql.includes("decompress"),
    )
    expect(decompress).toBeGreaterThan(-1)
    expect(decompress).toBeLessThan(update)
    expect(update).toBeLessThan(compress)
  })

  test("never touches compression on an uncompressed chunk", async () => {
    const { pool, statements } = fakePool(
      [chunk("_hyper_1_1_chunk", false, 1)],
      {
        updateRows: 1,
      },
    )

    await run({ pool, dryRun: false, workspaceId: null, log })

    expect(sqlOf(statements).join("\n")).not.toContain("compress_chunk")
  })

  test("a dry run only counts: no transaction, no update, no decompression", async () => {
    const { pool, statements } = fakePool(
      [chunk("_hyper_1_1_chunk", true, 1)],
      {
        updateRows: 7,
      },
    )

    const result = await run({ pool, dryRun: true, workspaceId: null, log })

    expect(result.total).toBe(7)
    const all = sqlOf(statements).join("\n")
    expect(all).not.toContain("BEGIN")
    expect(all).not.toContain("UPDATE")
    expect(all).not.toContain("compress_chunk")
  })

  test("a workspace id scopes every chunk query", async () => {
    const { pool, statements } = fakePool(
      [chunk("_hyper_1_1_chunk", false, 1)],
      {
        updateRows: 1,
      },
    )

    await run({ pool, dryRun: false, workspaceId: "42", log })

    expect(statements.find((s) => s.sql === UPDATE_SQL)?.params?.[2]).toBe("42")
  })

  test("a failing update rolls back, releases the connection and stops", async () => {
    const { pool, statements, release } = fakePool(
      [
        chunk("_hyper_1_1_chunk", false, 1),
        chunk("_hyper_1_2_chunk", false, 2),
      ],
      { updateRows: 1, failOn: (sql) => sql === UPDATE_SQL },
    )

    await expect(
      run({ pool, dryRun: false, workspaceId: null, log }),
    ).rejects.toThrow("boom")

    expect(sqlOf(statements)).toContain("ROLLBACK")
    expect(sqlOf(statements)).not.toContain("COMMIT")
    expect(release).toHaveBeenCalledTimes(1)
    expect(statements.filter((s) => s.sql === UPDATE_SQL)).toHaveLength(1)
  })

  test("a failed re-compress is reported but does not undo the update or stop the run", async () => {
    const { pool } = fakePool(
      [chunk("_hyper_1_1_chunk", true, 1), chunk("_hyper_1_2_chunk", false, 2)],
      {
        updateRows: 2,
        failOn: (sql) => sql.includes("SELECT compress_chunk"),
      },
    )
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    const result = await run({ pool, dryRun: false, workspaceId: null, log })

    expect(result).toEqual({ total: 4, recompressFailures: 1 })
    errors.mockRestore()
  })

  test("a chunk with nothing to fill is never decompressed, so a re-run leaves it alone", async () => {
    const { pool, statements } = fakePool(
      [chunk("_hyper_1_1_chunk", true, 1), chunk("_hyper_1_2_chunk", true, 2)],
      { updateRows: 0 },
    )

    const result = await run({ pool, dryRun: false, workspaceId: null, log })

    expect(result).toEqual({ total: 0, recompressFailures: 0 })
    const all = sqlOf(statements).join("\n")
    expect(all).not.toContain("BEGIN")
    expect(all).not.toContain("compress_chunk")
    expect(statements.some((s) => s.sql === UPDATE_SQL)).toBe(false)
  })

  test("the supported-language list is passed to every query", async () => {
    const { pool, statements } = fakePool(
      [chunk("_hyper_1_1_chunk", false, 1)],
      {
        updateRows: 1,
      },
    )

    await run({ pool, dryRun: false, workspaceId: null, log })

    for (const statement of statements.filter(
      (s) => s.sql === COUNT_SQL || s.sql === UPDATE_SQL,
    )) {
      expect(statement.params?.[3]).toBe(SUPPORTED_LANGUAGES)
    }
  })

  test("a hypertable with no chunks is a no-op", async () => {
    const { pool } = fakePool([])

    expect(await run({ pool, dryRun: false, workspaceId: null, log })).toEqual({
      total: 0,
      recompressFailures: 0,
    })
  })
})
