import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import { googleClickPredicate } from "../src/queries/google-click"
import { contactInboxRepository } from "../src/repositories/contact-inbox/repository"

const dialect = new PgDialect()

describe("googleClickPredicate", () => {
  test("matches a recorded gclid or gbraid and nothing Meta-related", () => {
    const { sql: text } = dialect.sqlToQuery(googleClickPredicate())

    expect(text).toContain(`->>'gclid' IS NOT NULL`)
    expect(text).toContain(`->>'gbraid' IS NOT NULL`)
    expect(text).not.toContain("ctwaClid")
  })
})

const selectChain = (rows: unknown[]) => {
  const captured: { where?: string; orderBy?: string } = {}
  const limit = vi.fn().mockResolvedValue(rows)
  const orderBy = vi.fn((order: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    captured.orderBy = dialect.sqlToQuery(order).sql
    return { limit }
  })
  const where = vi.fn((condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    captured.where = dialect.sqlToQuery(condition).sql
    return { limit, orderBy }
  })
  const innerJoin = vi.fn(() => ({ where }))
  const from = vi.fn(() => ({ innerJoin }))
  const select = vi.fn((_columns: Record<string, unknown>) => ({ from }))
  return { tx: { select } as never, captured, innerJoin, select }
}

describe("contactInboxRepository Google click lookups", () => {
  test("findGoogleClickAttribution is workspace-scoped through Inbox and requires a click", async () => {
    const { tx, captured, innerJoin } = selectChain([{ id: "1" }])

    const row = await contactInboxRepository.findGoogleClickAttribution(
      { workspaceId: "ws", contactInboxId: "ci" },
      tx,
    )

    expect(row).toEqual({ id: "1" })
    expect(innerJoin).toHaveBeenCalledTimes(1)
    expect(captured.where).toContain(`->>'gclid' IS NOT NULL`)
  })

  test("findGoogleClickAttribution returns null when no row matches", async () => {
    const { tx } = selectChain([])

    await expect(
      contactInboxRepository.findGoogleClickAttribution(
        { workspaceId: "ws", contactInboxId: "ci" },
        tx,
      ),
    ).resolves.toBeNull()
  })

  test("findLatestGoogleClickInboxByContact orders by the newest click", async () => {
    const { tx, captured } = selectChain([{ id: "2" }])

    await contactInboxRepository.findLatestGoogleClickInboxByContact(
      { workspaceId: "ws", contactId: "c" },
      tx,
    )

    expect(captured.orderBy).toContain("googleClickReceivedAt")
    expect(captured.orderBy).toContain("DESC NULLS LAST")
  })

  test("click lookups select the inbox sourceId for error-log attribution", async () => {
    const latest = selectChain([{ id: "2" }])
    await contactInboxRepository.findLatestGoogleClickInboxByContact(
      { workspaceId: "ws", contactId: "c" },
      latest.tx,
    )
    const direct = selectChain([{ id: "1" }])
    await contactInboxRepository.findGoogleClickAttribution(
      { workspaceId: "ws", contactInboxId: "ci" },
      direct.tx,
    )

    expect(Object.keys(latest.select.mock.calls[0][0])).toContain("sourceId")
    expect(Object.keys(direct.select.mock.calls[0][0])).toContain("sourceId")
  })
})
