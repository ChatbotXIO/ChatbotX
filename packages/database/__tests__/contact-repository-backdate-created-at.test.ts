import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import { contactRepository } from "../src/repositories/contact/repository"

const render = (statement: unknown) => {
  const rendered = new PgDialect().sqlToQuery(statement as never)
  return {
    sql: rendered.sql.replace(/\s+/g, " ").trim(),
    params: rendered.params,
  }
}

describe("contactRepository.backdateCreatedAt", () => {
  test("is a no-op with no rows", async () => {
    const execute = vi.fn()

    const changed = await contactRepository.backdateCreatedAt([], {
      execute,
    } as never)

    expect(execute).not.toHaveBeenCalled()
    expect(changed).toEqual([])
  })

  // Coexist history arrives newest-first across chunks and may be replayed:
  // the column must only ever move back, never forward, and only within the
  // caller's workspace. The ids that really changed come back so the caller
  // invalidates only those, not every row in the batch.
  test("moves createdAt back with LEAST in one workspace-scoped statement and returns the changed ids", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "contact-1" }] })
    const first = new Date("2025-01-01T00:00:00.000Z")
    const second = new Date("2025-02-01T00:00:00.000Z")

    const changed = await contactRepository.backdateCreatedAt(
      [
        { contactId: "contact-1", workspaceId: "ws-1", createdAt: first },
        { contactId: "contact-2", workspaceId: "ws-1", createdAt: second },
      ],
      { execute } as never,
    )

    expect(changed).toEqual(["contact-1"])
    expect(execute).toHaveBeenCalledTimes(1)
    const { sql, params } = render(execute.mock.calls[0]?.[0])
    expect(sql).toContain('UPDATE "Contact" AS t')
    expect(sql).toContain(
      'SET "createdAt" = LEAST(t."createdAt", u.created_ts)',
    )
    expect(sql).toContain('WHERE t."id" = u.id')
    expect(sql).toContain('AND t."workspaceId" = u.workspace_id')
    expect(sql).toContain('AND t."createdAt" > u.created_ts')
    expect(sql).toContain('RETURNING t."id"')
    expect(params).toEqual([
      "contact-1",
      "ws-1",
      first,
      "contact-2",
      "ws-1",
      second,
    ])
  })
})
