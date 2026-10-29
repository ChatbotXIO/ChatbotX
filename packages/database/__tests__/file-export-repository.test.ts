import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { fileRepository } from "../src/repositories/file/repository"

const dialect = new PgDialect()
const render = (clause: SQL) => dialect.sqlToQuery(clause)

const createSelectTx = (rows: unknown[]) => {
  const limit = vi.fn().mockResolvedValue(rows)
  const orderBy = vi.fn().mockReturnValue({ limit })
  const where = vi.fn().mockReturnValue({ orderBy })
  const leftJoin = vi.fn().mockReturnValue({ where })
  const from = vi.fn().mockReturnValue({ where, leftJoin })
  const select = vi.fn().mockReturnValue({ from })
  return {
    tx: { select } as unknown as DatabaseClient,
    select,
    where,
    orderBy,
    limit,
    leftJoin,
  }
}

describe("fileRepository.listExportsForWorkspace", () => {
  test("lists one workspace's exports of one kind, newest first, one row past the page", async () => {
    const { tx, select, where, limit, leftJoin } = createSelectTx([])

    await fileRepository.listExportsForWorkspace(
      { workspaceId: "ws-1", subType: "contacts", limit: 20 },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"File"."workspaceId" = $1')
    expect(sql).toContain('"File"."contextType" = $2')
    expect(sql).toContain('"File"."subType" = $3')
    expect(sql).not.toContain('"File"."userId"')
    expect(params).toEqual(["ws-1", "export", "contacts"])
    // The requester's name comes from a left join: a token export has none.
    expect(leftJoin).toHaveBeenCalledTimes(1)
    // The cursor column is rendered in UTC with microseconds.
    const { createdAtCursor } = select.mock.calls[0]?.[0] as {
      createdAtCursor: SQL
    }
    expect(render(createdAtCursor).sql).toBe(
      `to_char("File"."createdAt" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    )
    expect(limit).toHaveBeenCalledWith(21)
  })

  test("narrows to the creator and pages by (createdAt, id)", async () => {
    const { tx, where } = createSelectTx([])
    const cursor = { createdAt: "2026-10-20T00:00:00.123456Z", id: "9" }

    await fileRepository.listExportsForWorkspace(
      {
        workspaceId: "ws-1",
        subType: "contacts",
        userId: "u-1",
        limit: 20,
        cursor,
      },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"File"."userId" = $4')
    // Compared as a row, at the column's full microsecond precision.
    expect(sql).toContain(
      '("File"."createdAt", "File"."id") < ($5::timestamptz, $6::bigint)',
    )
    expect(params).toEqual([
      "ws-1",
      "export",
      "contacts",
      "u-1",
      "2026-10-20T00:00:00.123456Z",
      "9",
    ])
  })
})

describe("fileRepository.listExportsCreatedBefore", () => {
  test("reads only export rows of one kind older than the cutoff, oldest first, bounded", async () => {
    const { tx, where, limit } = createSelectTx([])
    const before = new Date("2026-10-22T00:00:00.000Z")

    await fileRepository.listExportsCreatedBefore(
      { subType: "contacts", before, limit: 500 },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    // The contextType filter is what lets Postgres use the partial
    // `File_export_createdAt_idx` instead of scanning every upload.
    expect(sql).toContain('"File"."contextType" = $1')
    expect(sql).toContain('"File"."subType" = $2')
    expect(sql).toContain('"File"."createdAt" < $3')
    expect(sql).not.toContain('("File"."createdAt", "File"."id")')
    expect(params.slice(0, 2)).toEqual(["export", "contacts"])
    expect(limit).toHaveBeenCalledWith(500)
  })

  test("resumes past the previous batch, oldest first", async () => {
    const { tx, where } = createSelectTx([])

    await fileRepository.listExportsCreatedBefore(
      {
        subType: "contacts",
        before: new Date("2026-10-22T00:00:00.000Z"),
        limit: 500,
        after: { createdAt: "2026-10-01T00:00:00.500000Z", id: "7" },
      },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain(
      '("File"."createdAt", "File"."id") > ($4::timestamptz, $5::bigint)',
    )
    expect(params.slice(3)).toEqual(["2026-10-01T00:00:00.500000Z", "7"])
  })
})

describe("fileRepository.deleteById", () => {
  test("deletes exactly the given row", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const remove = vi.fn().mockReturnValue({ where })
    const tx = { delete: remove } as unknown as DatabaseClient

    await fileRepository.deleteById({ id: "f-1" }, tx)

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toBe('"File"."id" = $1')
    expect(params).toEqual(["f-1"])
  })
})
