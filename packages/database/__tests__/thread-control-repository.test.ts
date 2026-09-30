// @vitest-environment node

import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import { THREAD_CONTROL_SEEN_REFRESH_MS } from "../src/partials/thread-control"
import { contactInboxRepository } from "../src/repositories/contact-inbox/repository"
import { inboxRepository } from "../src/repositories/inbox/repository"
import { integrationWhatsappRepository } from "../src/repositories/integration-whatsapp/repository"
import { inboxModel } from "../src/schema"

const dialect = new PgDialect()
const render = (condition: SQL | undefined) => {
  expect(condition).toBeDefined()
  return dialect.sqlToQuery(condition as SQL)
}

type UpdateChain = {
  set: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
}

function createTx(result: unknown[]) {
  const chain: UpdateChain & {
    update: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    from: ReturnType<typeof vi.fn>
  } = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
  }
  chain.update.mockReturnValue(chain)
  chain.set.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.returning.mockResolvedValue(result)
  // Sub-select used by the workspace-scope `exists`; it is never awaited.
  chain.select.mockReturnValue(chain)
  chain.from.mockReturnValue(chain)
  return chain
}

/** The outer UPDATE's `where`; the shared mock also records the sub-select's. */
const lastWhere = (tx: { where: ReturnType<typeof vi.fn> }): SQL =>
  tx.where.mock.calls.at(-1)?.[0] as SQL

const OCCURRED_AT = new Date("2026-09-29T10:00:00.000Z")

describe("contactInboxRepository.applyThreadControlTransition", () => {
  test("writes the state derived from the event plus role, time and event", async () => {
    const tx = createTx([{ id: "ci-1" }])

    const row = await contactInboxRepository.applyThreadControlTransition(
      {
        id: "ci-1",
        workspaceId: "ws-1",
        event: "standbyReceived",
        ownerRole: "ai_agent",
        occurredAt: OCCURRED_AT,
      },
      tx as never,
    )

    expect(tx.set).toHaveBeenCalledWith({
      threadControlState: "standby",
      threadOwnerRole: "ai_agent",
      threadControlUpdatedAt: OCCURRED_AT,
      threadControlLastEvent: "standbyReceived",
    })
    expect(row).toEqual({ id: "ci-1" })
  })

  test("returns null when the guard rejects the event as stale", async () => {
    const tx = createTx([])

    const row = await contactInboxRepository.applyThreadControlTransition(
      {
        id: "ci-1",
        workspaceId: "ws-1",
        event: "released",
        ownerRole: null,
        occurredAt: OCCURRED_AT,
      },
      tx as never,
    )

    expect(row).toBeNull()
  })

  test("guard scopes by id and workspace and orders by timestamp then precedence", async () => {
    const tx = createTx([])

    await contactInboxRepository.applyThreadControlTransition(
      {
        id: "ci-1",
        workspaceId: "ws-1",
        event: "taken",
        ownerRole: "escalation",
        occurredAt: OCCURRED_AT,
      },
      tx as never,
    )

    const { sql, params } = render(lastWhere(tx))
    expect(sql).toContain('"ContactInbox"."id" = $')
    expect(sql).toContain("exists")
    expect(sql).toContain('"threadControlUpdatedAt" is null')
    expect(sql).toContain('"threadControlUpdatedAt" < $')
    expect(sql).toContain('"threadControlUpdatedAt" = $')
    expect(sql).toContain('"threadControlLastEvent" in (')
    expect(sql).toContain("IS NOT DISTINCT FROM")
    expect(params).toContain("ci-1")
    // The workspace scope is the `exists` sub-select on Inbox (first `where`).
    expect(render(tx.where.mock.calls[0][0]).params).toContain("ws-1")
    // `taken` outranks the inferred and outbound-call events, never itself or Meta's.
    expect(params).toEqual(
      expect.arrayContaining([
        "inboundReceived",
        "standbyReceived",
        "serviceSent",
        "serviceRejected",
        "passed",
        "released",
      ]),
    )
    expect(params).not.toContain("controlPassed")
    expect(params).not.toContain("controlTaken")
  })

  test("the lowest-precedence event has no outranked list, only redelivery on a tie", async () => {
    const tx = createTx([])

    await contactInboxRepository.applyThreadControlTransition(
      {
        id: "ci-1",
        workspaceId: "ws-1",
        event: "inboundReceived",
        ownerRole: null,
        occurredAt: OCCURRED_AT,
      },
      tx as never,
    )

    const { sql } = render(lastWhere(tx))
    expect(sql).not.toContain('"threadControlLastEvent" in (')
    expect(sql).toContain('"threadControlLastEvent" = $')
  })
})

describe("contactInboxRepository.listThreadControlledByContactIds", () => {
  test("returns [] without querying for an empty id list", async () => {
    const tx = { select: vi.fn() }

    const rows = await contactInboxRepository.listThreadControlledByContactIds(
      { workspaceId: "ws-1", contactIds: [] },
      tx as never,
    )

    expect(rows).toEqual([])
    expect(tx.select).not.toHaveBeenCalled()
  })

  test("joins Inbox scoped to the workspace and filters owned rows in one query", async () => {
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.innerJoin.mockReturnValue(chain)
    chain.where.mockResolvedValue([{ id: "ci-1" }])

    const rows = await contactInboxRepository.listThreadControlledByContactIds(
      { workspaceId: "ws-1", contactIds: ["c-1", "c-2"] },
      chain as never,
    )

    expect(rows).toEqual([{ id: "ci-1" }])
    expect(chain.select).toHaveBeenCalledTimes(1)
    const join = render(chain.innerJoin.mock.calls[0][1])
    expect(join.params).toContain("ws-1")
    const where = render(chain.where.mock.calls[0][0])
    expect(where.sql).toContain('"contactId" in (')
    expect(where.params).toEqual(
      expect.arrayContaining(["c-1", "c-2", "owned"]),
    )
  })
})

describe("inboxRepository.touchThreadControlSeen", () => {
  const seenAt = new Date("2026-09-29T10:00:00.000Z")

  test("sets the timestamp guarded by workspace and a SQL-side throttle", async () => {
    const tx = createTx([{ id: "inbox-1" }])

    const written = await inboxRepository.touchThreadControlSeen(
      { workspaceId: "ws-1", inboxId: "inbox-1", seenAt },
      tx as never,
    )

    expect(written).toBe(true)
    expect(tx.set).toHaveBeenCalledWith({ threadControlSeenAt: seenAt })
    const { sql, params } = render(lastWhere(tx))
    expect(sql).toContain('"threadControlSeenAt" is null')
    expect(sql).toContain('"threadControlSeenAt" < $')
    expect(params).toEqual(
      expect.arrayContaining([
        "inbox-1",
        "ws-1",
        new Date(
          seenAt.getTime() - THREAD_CONTROL_SEEN_REFRESH_MS,
        ).toISOString(),
      ]),
    )
  })

  test("reports false when the throttle skipped the write", async () => {
    const tx = createTx([])

    const written = await inboxRepository.touchThreadControlSeen(
      { workspaceId: "ws-1", inboxId: "inbox-1", seenAt },
      tx as never,
    )

    expect(written).toBe(false)
  })
})

describe("integrationWhatsappRepository.updateHandoverResumeFlow", () => {
  test("sets the flow, scoped by workspace and integration", async () => {
    const tx = createTx([{ id: "iw-1", handoverResumeFlowId: "flow-1" }])

    const row = await integrationWhatsappRepository.updateHandoverResumeFlow(
      { id: "iw-1", workspaceId: "ws-1", handoverResumeFlowId: "flow-1" },
      tx as never,
    )

    expect(tx.set).toHaveBeenCalledWith({ handoverResumeFlowId: "flow-1" })
    const { params } = render(lastWhere(tx))
    expect(params).toEqual(expect.arrayContaining(["iw-1", "ws-1"]))
    expect(row).toEqual({ id: "iw-1", handoverResumeFlowId: "flow-1" })
  })

  test("clears the flow with null", async () => {
    const tx = createTx([{ id: "iw-1", handoverResumeFlowId: null }])

    await integrationWhatsappRepository.updateHandoverResumeFlow(
      { id: "iw-1", workspaceId: "ws-1", handoverResumeFlowId: null },
      tx as never,
    )

    expect(tx.set).toHaveBeenCalledWith({ handoverResumeFlowId: null })
  })

  test("returns null when the integration is not in the workspace", async () => {
    const tx = createTx([])

    const row = await integrationWhatsappRepository.updateHandoverResumeFlow(
      { id: "iw-1", workspaceId: "other", handoverResumeFlowId: "flow-1" },
      tx as never,
    )

    expect(row).toBeNull()
  })
})

describe("integrationWhatsappRepository.findAllConnectedForWebhookSubscription", () => {
  test("joins the inbox and keeps only connected inboxes", async () => {
    const rows = [{ id: "i-1", workspaceId: "ws-1", wabaId: "w-1", auth: {} }]
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.innerJoin.mockReturnValue(chain)
    chain.where.mockResolvedValue(rows)

    const result =
      await integrationWhatsappRepository.findAllConnectedForWebhookSubscription(
        chain as never,
      )

    expect(result).toBe(rows)
    expect(chain.innerJoin).toHaveBeenCalledTimes(1)
    const [joinTable, joinOn] = chain.innerJoin.mock.calls[0] ?? []
    expect(joinTable).toBe(inboxModel)
    expect(render(joinOn as SQL).sql).toBe(
      '"Inbox"."id" = "IntegrationWhatsapp"."inboxId"',
    )
    const where = render(chain.where.mock.calls[0]?.[0] as SQL)
    expect(where.sql).toBe('"Inbox"."status" = $1')
    expect(where.params).toEqual(["connected"])
  })
})

describe("contactInboxRepository.findModelByIdForWorkspace", () => {
  const buildChain = (rows: unknown[]) => {
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.innerJoin.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.limit.mockResolvedValue(rows)
    return chain
  }

  test("returns the full contact inbox row, joined to the workspace's inbox", async () => {
    const contactInbox = { id: "ci-1", threadControlState: "owned" }
    const chain = buildChain([{ contactInbox }])

    const row = await contactInboxRepository.findModelByIdForWorkspace(
      { id: "ci-1", workspaceId: "ws-1" },
      chain as never,
    )

    expect(row).toBe(contactInbox)
    const [joinTable, joinOn] = chain.innerJoin.mock.calls[0] ?? []
    expect(joinTable).toBe(inboxModel)
    const on = render(joinOn as SQL)
    expect(on.sql).toContain('"Inbox"."workspaceId"')
    expect(on.params).toEqual(["ws-1"])
  })

  test("returns null for an unknown id or another workspace", async () => {
    const chain = buildChain([])

    const row = await contactInboxRepository.findModelByIdForWorkspace(
      { id: "ci-1", workspaceId: "other" },
      chain as never,
    )

    expect(row).toBeNull()
  })
})
