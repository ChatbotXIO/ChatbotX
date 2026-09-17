import { describe, expect, test, vi } from "vitest"
import { DrizzleQueryError } from "../src/client"
import {
  canAdvanceStatus,
  whatsappCallRepository,
} from "../src/repositories/whatsapp-call/repository"
import { whatsappCallModel } from "../src/schema"

const PENDING_OUTBOUND_EXISTS_RE = /pending-outbound-exists/

/**
 * Renders a drizzle WHERE clause back to readable SQL-ish text (columns,
 * operators and bound values in order) so a test can assert the actual
 * predicate that reaches Postgres, not merely that *some* clause was passed.
 * The guards on the liveness/recovery updates are the concurrency control
 * itself — asserting their shape is the only way to pin it without a database.
 */
const renderPredicate = (clause: unknown): string => {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child)
      }
      return
    }
    if (!node || typeof node !== "object") {
      return
    }
    const entry = node as Record<string, unknown>
    if (typeof entry.name === "string" && entry.table) {
      parts.push(`"${entry.name}"`)
      return
    }
    if (Array.isArray(entry.queryChunks)) {
      walk(entry.queryChunks)
      return
    }
    if ("value" in entry) {
      parts.push(String(entry.value))
    }
  }
  walk((clause as { queryChunks?: unknown }).queryChunks)
  return parts.join("").replace(/\s+/g, " ").trim()
}

type Row = typeof whatsappCallModel.$inferSelect

const baseRow = (overrides: Partial<Row> = {}): Row =>
  ({
    id: "call-1",
    wacid: null,
    attemptId: null,
    direction: "userInitiated",
    status: "ringing",
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    messageId: null,
    lastError: null,
    answeredByUserId: null,
    initiatedByUserId: null,
    recordingPath: null,
    recordedAt: null,
    transcript: null,
    transcribedAt: null,
    transcriptSegments: null,
    aiSummary: null,
    aiSummarizedAt: null,
    aiSummaryProvider: null,
    workspaceId: "ws-1",
    inboxId: "inbox-1",
    contactInboxId: "ci-1",
    conversationId: "conv-1",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  }) as Row

/** Builds a fake `tx` chain that records every call for assertion. */
function createUpdateChain(result: unknown[]) {
  const chain = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  }
  chain.update.mockReturnValue(chain)
  chain.set.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.returning.mockResolvedValue(result)
  return chain
}

describe("canAdvanceStatus", () => {
  test("never allows anything to advance past completed", () => {
    expect(canAdvanceStatus("completed", "ringing")).toBe(false)
    expect(canAdvanceStatus("completed", "accepted")).toBe(false)
    expect(canAdvanceStatus("completed", "rejected")).toBe(false)
    expect(canAdvanceStatus("completed", "failed")).toBe(false)
    expect(canAdvanceStatus("completed", "completed")).toBe(false)
  })

  test("allows rejected to overwrite a stale failed", () => {
    expect(canAdvanceStatus("failed", "rejected")).toBe(true)
  })

  test("blocks a same-or-lower rank transition", () => {
    expect(canAdvanceStatus("accepted", "ringing")).toBe(false)
    expect(canAdvanceStatus("accepted", "accepted")).toBe(false)
  })

  test("allows a strictly higher rank transition", () => {
    expect(canAdvanceStatus("ringing", "accepted")).toBe(true)
    expect(canAdvanceStatus("accepted", "completed")).toBe(true)
  })
})

describe("whatsappCallRepository.findByIdForWorkspace", () => {
  test("scopes the lookup by workspaceId in the WHERE clause (B7 defense-in-depth)", async () => {
    const row = baseRow()
    const findFirst = vi.fn().mockResolvedValue(row)
    const tx = { query: { whatsappCallModel: { findFirst } } }

    const result = await whatsappCallRepository.findByIdForWorkspace(
      "call-1",
      "ws-1",
      tx as never,
    )

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "call-1", workspaceId: "ws-1" },
    })
    expect(result).toEqual(row)
  })

  test("returns undefined when no row matches (wrong workspace or missing id)", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined)
    const tx = { query: { whatsappCallModel: { findFirst } } }

    const result = await whatsappCallRepository.findByIdForWorkspace(
      "call-1",
      "ws-other",
      tx as never,
    )

    expect(result).toBeUndefined()
  })
})

describe("whatsappCallRepository.finalizeById", () => {
  test("never downgrades a completed row, even if the caller asks", async () => {
    const current = baseRow({ status: "completed" })
    const tx = createUpdateChain([])

    const result = await whatsappCallRepository.finalizeById(
      { id: current.id, status: "failed", current },
      tx as never,
    )

    expect(tx.update).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  test("advances ringing to completed and writes the terminal fields", async () => {
    const current = baseRow({ status: "accepted" })
    const updated = baseRow({ status: "completed" })
    const tx = createUpdateChain([updated])

    const result = await whatsappCallRepository.finalizeById(
      {
        id: current.id,
        status: "completed",
        current,
        endedAt: new Date("2026-08-01T00:05:00.000Z"),
        durationSeconds: 300,
      },
      tx as never,
    )

    expect(tx.update).toHaveBeenCalledWith(whatsappCallModel)
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", durationSeconds: 300 }),
    )
    expect(result).toEqual(updated)
  })
})

describe("whatsappCallRepository.finalizeById idempotent endedAt fill", () => {
  test("fills missing endedAt on a same-status terminate redelivery, status unchanged", async () => {
    const current = baseRow({ status: "rejected", endedAt: null })
    const filled = baseRow({
      status: "rejected",
      endedAt: new Date("2026-08-01T00:05:00.000Z"),
    })
    const tx = createUpdateChain([filled])

    const result = await whatsappCallRepository.finalizeById(
      {
        id: current.id,
        status: "rejected",
        current,
        endedAt: new Date("2026-08-01T00:05:00.000Z"),
      },
      tx as never,
    )

    expect(tx.update).toHaveBeenCalledWith(whatsappCallModel)
    expect(tx.set).toHaveBeenCalledWith({
      endedAt: new Date("2026-08-01T00:05:00.000Z"),
    })
    expect(result).toEqual(filled)
  })

  test("does not overwrite an existing endedAt on a same-status terminate redelivery", async () => {
    const authoritativeEndedAt = new Date("2026-08-01T00:01:00.000Z")
    const current = baseRow({
      status: "rejected",
      endedAt: authoritativeEndedAt,
    })
    const tx = createUpdateChain([])

    const result = await whatsappCallRepository.finalizeById(
      {
        id: current.id,
        status: "rejected",
        current,
        endedAt: new Date("2026-08-01T00:09:00.000Z"),
      },
      tx as never,
    )

    // Nothing left to fill (endedAt already set) — no UPDATE issued at all.
    expect(tx.update).not.toHaveBeenCalled()
    expect(result).toEqual(current)
  })

  test("still blocks a genuine downgrade attempt (different, lower-rank status)", async () => {
    const current = baseRow({ status: "completed", endedAt: null })
    const tx = createUpdateChain([])

    const result = await whatsappCallRepository.finalizeById(
      { id: current.id, status: "failed", current },
      tx as never,
    )

    expect(tx.update).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  test("fills every still-missing terminal field (not just endedAt) on a same-status redelivery", async () => {
    const current = baseRow({
      status: "rejected",
      endedAt: null,
      messageId: null,
      lastError: null,
    })
    const filled = baseRow({
      status: "rejected",
      endedAt: new Date("2026-08-01T00:05:00.000Z"),
      messageId: "msg-1",
      lastError: "meta-timeout",
    })
    const tx = createUpdateChain([filled])

    const result = await whatsappCallRepository.finalizeById(
      {
        id: current.id,
        status: "rejected",
        current,
        endedAt: new Date("2026-08-01T00:05:00.000Z"),
        messageId: "msg-1",
        lastError: "meta-timeout",
      },
      tx as never,
    )

    expect(tx.set).toHaveBeenCalledWith({
      endedAt: new Date("2026-08-01T00:05:00.000Z"),
      messageId: "msg-1",
      lastError: "meta-timeout",
    })
    expect(result).toEqual(filled)
  })

  test("does not clobber an already-set messageId on redelivery, even while filling the still-missing endedAt", async () => {
    const current = baseRow({
      status: "rejected",
      endedAt: null,
      messageId: "authoritative-msg",
    })
    const filled = baseRow({
      status: "rejected",
      endedAt: new Date("2026-08-01T00:05:00.000Z"),
      messageId: "authoritative-msg",
    })
    const tx = createUpdateChain([filled])

    const result = await whatsappCallRepository.finalizeById(
      {
        id: current.id,
        status: "rejected",
        current,
        endedAt: new Date("2026-08-01T00:05:00.000Z"),
        // A different/stale messageId from a redelivered payload — must
        // never overwrite the row's already-set (authoritative) value.
        messageId: "stale-redelivered-msg",
      },
      tx as never,
    )

    // Only endedAt is in the SET — messageId is guarded out entirely because
    // current.messageId is already non-null, so a concurrent/earlier writer's
    // value for that column is never clobbered by this redelivery.
    expect(tx.set).toHaveBeenCalledWith({
      endedAt: new Date("2026-08-01T00:05:00.000Z"),
    })
    expect(result).toEqual(filled)
  })
})

describe("whatsappCallRepository.markAcceptedIfActive", () => {
  test("applies from ringing", async () => {
    const row = baseRow({ status: "accepted", answeredByUserId: "user-1" })
    const tx = createUpdateChain([row])

    const result = await whatsappCallRepository.markAcceptedIfActive(
      { id: row.id, answeredByUserId: "user-1" },
      tx as never,
    )

    expect(tx.set).toHaveBeenCalledWith({
      status: "accepted",
      answeredByUserId: "user-1",
    })
    expect(result).toEqual(row)
  })

  test.each([
    "rejected",
    "completed",
    "failed",
  ] as const)("no-ops from terminal status %s", async () => {
    const tx = createUpdateChain([])

    const result = await whatsappCallRepository.markAcceptedIfActive(
      { id: "call-1", answeredByUserId: "user-1" },
      tx as never,
    )

    expect(result).toBeUndefined()
  })

  test("sets answeredByUserId only on apply", async () => {
    const tx = createUpdateChain([])

    await whatsappCallRepository.markAcceptedIfActive(
      { id: "call-1", answeredByUserId: "user-2" },
      tx as never,
    )

    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ answeredByUserId: "user-2" }),
    )
    // The guarded WHERE is what actually prevents the write from applying
    // against a terminal row in the real DB (this fake chain always
    // resolves `.returning()` to the configured value); assert the WHERE
    // is a real SQL predicate (not a plain truthy value) so the guard
    // reaches Postgres rather than being decorative.
    expect(tx.where).toHaveBeenCalledTimes(1)
    const whereArg = tx.where.mock.calls[0]?.[0] as { queryChunks?: unknown }
    expect(whereArg.queryChunks).toBeDefined()
  })
})

describe("whatsappCallRepository.touchLivenessIfStale", () => {
  const chain = (rows: { id: string }[]) => {
    const returning = vi.fn().mockResolvedValue(rows)
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    return { tx: { update: vi.fn(() => ({ set })) }, set, where }
  }

  const cutoff = new Date("2026-08-01T00:00:00.000Z")

  test("wins the claim: bumps updatedAt behind a status + staleness guard", async () => {
    const { tx, set, where } = chain([{ id: "call-1" }])

    await expect(
      whatsappCallRepository.touchLivenessIfStale(
        { id: "call-1", olderThan: cutoff },
        tx as never,
      ),
    ).resolves.toBe(true)

    expect(set).toHaveBeenCalledWith({ updatedAt: expect.any(Date) })
    // The guard must reach Postgres — it is what keeps concurrent beats from
    // double-writing, and what makes a heartbeat lose to dial-time recovery
    // (both statements lock the same row, so exactly one predicate can hold).
    expect(where).toHaveBeenCalledTimes(1)
    expect(renderPredicate(where.mock.calls[0]?.[0])).toBe(
      `(("id" = call-1) and ("status" = accepted) and ("updatedAt" < ${cutoff}))`,
    )
  })

  test("loses the claim when the row was updated since the cutoff", async () => {
    const { tx } = chain([])

    await expect(
      whatsappCallRepository.touchLivenessIfStale(
        { id: "call-1", olderThan: cutoff },
        tx as never,
      ),
    ).resolves.toBe(false)
  })
})

describe("whatsappCallRepository.attachWacid", () => {
  test("is a no-op when the row already carries this exact wacid", async () => {
    const current = baseRow({ wacid: "wamid.1" })
    const findFirst = vi.fn().mockResolvedValue(current)
    const trx = { query: { whatsappCallModel: { findFirst } } }

    const result = await whatsappCallRepository.attachWacid(
      { id: current.id, wacid: "wamid.1" },
      trx as never,
    )

    expect(result).toEqual(current)
  })

  test("merges the newer row into the older one on a wacid collision", async () => {
    const older = baseRow({
      id: "call-older",
      wacid: "wamid.1",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      recordingPath: "space/ws-1/calls/call-older.ogg",
    })
    const newer = baseRow({
      id: "call-newer",
      wacid: null,
      createdAt: new Date("2026-08-01T00:05:00.000Z"),
    })

    // `findFirst` backs both `findById` (`{ where: { id } }`) and
    // `findByWacid` (`{ where: { wacid } }`) — one resolver keyed on which
    // filter the call used.
    const findFirst = vi.fn(
      (args: { where: { id?: string; wacid?: string } }) => {
        if (args.where.id) {
          return Promise.resolve(args.where.id === newer.id ? newer : undefined)
        }
        return Promise.resolve(args.where.wacid ? older : undefined)
      },
    )

    const updateChain = createUpdateChain([]) // the isNull(wacid) attempt loses
    const mergeChain = createUpdateChain([
      { ...older, attemptId: "attempt-newer" },
    ])
    const deleteChain = { delete: vi.fn(), where: vi.fn() }
    deleteChain.delete.mockReturnValue(deleteChain)
    deleteChain.where.mockResolvedValue(undefined)

    let updateCallCount = 0
    const trx = {
      query: { whatsappCallModel: { findFirst } },
      update: vi.fn(() => {
        updateCallCount += 1
        return updateCallCount === 1 ? updateChain : mergeChain
      }),
      delete: deleteChain.delete,
    }

    const result = await whatsappCallRepository.attachWacid(
      { id: newer.id, wacid: "wamid.1" },
      trx as never,
    )

    expect(deleteChain.where).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ attemptId: "attempt-newer" })
  })
})

describe("whatsappCallRepository.createPendingOutbound", () => {
  test("inserts a null-wacid businessInitiated ringing row", async () => {
    const row = baseRow({ direction: "businessInitiated", attemptId: "att-1" })
    const tx = { insert: vi.fn(), values: vi.fn(), returning: vi.fn() }
    tx.insert.mockReturnValue(tx)
    tx.values.mockReturnValue(tx)
    tx.returning.mockResolvedValue([row])

    const result = await whatsappCallRepository.createPendingOutbound(
      {
        attemptId: "att-1",
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
      tx as never,
    )

    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "att-1",
        wacid: null,
        direction: "businessInitiated",
        status: "ringing",
        answeredByUserId: null,
      }),
    )
    expect(result).toEqual(row)
  })

  test("stamps answeredByUserId with the initiator when provided (VoIP outbound)", async () => {
    const row = baseRow({
      direction: "businessInitiated",
      attemptId: "att-1",
      answeredByUserId: "agent-1",
    })
    const tx = { insert: vi.fn(), values: vi.fn(), returning: vi.fn() }
    tx.insert.mockReturnValue(tx)
    tx.values.mockReturnValue(tx)
    tx.returning.mockResolvedValue([row])

    const result = await whatsappCallRepository.createPendingOutbound(
      {
        attemptId: "att-1",
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        answeredByUserId: "agent-1",
      },
      tx as never,
    )

    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "att-1",
        answeredByUserId: "agent-1",
      }),
    )
    expect(result).toEqual(row)
  })

  test("maps the pendingOutbound unique-index violation to a typed error", async () => {
    const conflictError = new DrizzleQueryError("insert", [], {
      code: "23505",
      constraint: "WhatsappCall_pendingOutbound_key",
    })
    const tx = {
      insert: vi.fn(),
      values: vi.fn(),
      returning: vi.fn(),
    }
    tx.insert.mockReturnValue(tx)
    tx.values.mockReturnValue(tx)
    tx.returning.mockRejectedValue(conflictError)

    await expect(
      whatsappCallRepository.createPendingOutbound(
        {
          attemptId: "att-1",
          workspaceId: "ws-1",
          inboxId: "inbox-1",
          contactInboxId: "ci-1",
          conversationId: "conv-1",
        },
        tx as never,
      ),
    ).rejects.toThrow(PENDING_OUTBOUND_EXISTS_RE)
  })
})

describe("whatsappCallRepository.markRecordingArrangement", () => {
  const chain = (rows: unknown[]) => {
    const returning = vi.fn().mockResolvedValue(rows)
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    return { tx: { update: vi.fn(() => ({ set })) }, set }
  }

  test("stores that a recording is coming, clearing any failure reason", async () => {
    const row = baseRow()
    const { tx, set } = chain([row])

    await expect(
      whatsappCallRepository.markRecordingArrangement(
        { id: "call-1", recordingRequested: true },
        tx as never,
      ),
    ).resolves.toEqual(row)
    expect(set).toHaveBeenCalledWith({
      recordingRequested: true,
      recordingFailureReason: null,
    })
  })

  test("stores why no recording is coming", async () => {
    const { tx, set } = chain([baseRow()])

    await whatsappCallRepository.markRecordingArrangement(
      {
        id: "call-1",
        recordingRequested: false,
        recordingFailureReason: "meta-rejected-recording-announcement",
      },
      tx as never,
    )

    expect(set).toHaveBeenCalledWith({
      recordingRequested: false,
      recordingFailureReason: "meta-rejected-recording-announcement",
    })
  })
})

describe("whatsappCallRepository.recoverStrandedAccepted", () => {
  const chain = (rows: unknown[]) => {
    const returning = vi.fn().mockResolvedValue(rows)
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    return { tx: { update: vi.fn(() => ({ set })) }, set, where }
  }

  const props = {
    id: "call-1",
    olderThan: new Date("2026-08-01T00:10:00.000Z"),
    lastError: "stranded-accepted-recovered-on-dial",
  }

  test("terminalizes the stale accepted row in one guarded statement", async () => {
    const row = baseRow({ status: "completed" })
    const { tx, set, where } = chain([row])

    await expect(
      whatsappCallRepository.recoverStrandedAccepted(props, tx as never),
    ).resolves.toEqual(row)

    // Status and staleness are guarded in the SAME update that writes the
    // terminal status — no window in which a heartbeat could not intervene.
    // No `endedAt`: we know the call is over, never when it ended, and
    // leaving it null lets a delayed terminate still stamp the real value.
    expect(set).toHaveBeenCalledWith({
      status: "completed",
      lastError: props.lastError,
    })
    expect(where).toHaveBeenCalledTimes(1)
    expect(renderPredicate(where.mock.calls[0]?.[0])).toBe(
      `(("id" = call-1) and ("status" = accepted) and ("updatedAt" < ${props.olderThan}))`,
    )
  })

  test("returns undefined when a heartbeat or a real terminate got there first", async () => {
    const { tx } = chain([])

    await expect(
      whatsappCallRepository.recoverStrandedAccepted(props, tx as never),
    ).resolves.toBeUndefined()
  })
})

describe("whatsappCallRepository.findActiveByContactInbox", () => {
  test("returns a ringing/accepted row regardless of direction (glare guard)", async () => {
    const row = baseRow({ direction: "userInitiated", status: "ringing" })
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.orderBy.mockReturnValue(chain)
    chain.limit.mockResolvedValue([row])

    const result = await whatsappCallRepository.findActiveByContactInbox(
      { inboxId: "inbox-1", contactInboxId: "ci-1" },
      chain as never,
    )

    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(result).toEqual(row)
  })

  test("also matches a businessInitiated active row", async () => {
    const row = baseRow({ direction: "businessInitiated", status: "accepted" })
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.orderBy.mockReturnValue(chain)
    chain.limit.mockResolvedValue([row])

    const result = await whatsappCallRepository.findActiveByContactInbox(
      { inboxId: "inbox-1", contactInboxId: "ci-1" },
      chain as never,
    )

    expect(result).toEqual(row)
  })

  test("returns undefined when nothing is active", async () => {
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.orderBy.mockReturnValue(chain)
    chain.limit.mockResolvedValue([])

    const result = await whatsappCallRepository.findActiveByContactInbox(
      { inboxId: "inbox-1", contactInboxId: "ci-1" },
      chain as never,
    )

    expect(result).toBeUndefined()
  })
})

describe("whatsappCallRepository.findRingingByWorkspace", () => {
  test("scopes to workspace/ringing/wacid-present/unanswered rows, newest first, bounded by limit", async () => {
    const rows = [baseRow({ wacid: "wacid.ABC" })]
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.orderBy.mockReturnValue(chain)
    chain.limit.mockResolvedValue(rows)

    const result = await whatsappCallRepository.findRingingByWorkspace(
      "ws-1",
      chain as never,
    )

    expect(chain.limit).toHaveBeenCalledWith(20)
    expect(result).toEqual(rows)
  })

  test("returns an empty array when nothing is ringing", async () => {
    const chain = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    chain.orderBy.mockReturnValue(chain)
    chain.limit.mockResolvedValue([])

    const result = await whatsappCallRepository.findRingingByWorkspace(
      "ws-1",
      chain as never,
    )

    expect(result).toEqual([])
  })
})

describe("whatsappCallRepository.listRecordingsPastRetention", () => {
  test("joins IntegrationWhatsapp and bounds by limit, never offset", async () => {
    const row = baseRow({
      id: "call-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
      recordedAt: new Date("2026-01-01T00:00:00.000Z"),
    })
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
    chain.limit.mockResolvedValue([{ call: row }])

    const result = await whatsappCallRepository.listRecordingsPastRetention(
      { limit: 500 },
      chain as never,
    )

    expect(chain.limit).toHaveBeenCalledWith(500)
    expect(result).toEqual([row])
  })
})

describe("whatsappCallRepository.clearRecording", () => {
  test("nulls recordingPath/recordedAt and keeps the transcript untouched", async () => {
    const chain = { update: vi.fn(), set: vi.fn(), where: vi.fn() }
    chain.update.mockReturnValue(chain)
    chain.set.mockReturnValue(chain)
    chain.where.mockResolvedValue(undefined)

    await whatsappCallRepository.clearRecording(
      { id: "call-1" },
      chain as never,
    )

    expect(chain.set).toHaveBeenCalledWith({
      recordingPath: null,
      recordedAt: null,
    })
  })
})

describe("whatsappCallRepository.attachTranscript", () => {
  test("stamps the flat transcript only when segments are omitted (SIP/Whisper)", async () => {
    const row = baseRow({
      transcript: "hello there",
      transcribedAt: new Date(),
    })
    const chain = createUpdateChain([row])

    const result = await whatsappCallRepository.attachTranscript(
      {
        id: "call-1",
        transcript: "hello there",
        transcribedAt: row.transcribedAt as Date,
      },
      chain as never,
    )

    expect(chain.set).toHaveBeenCalledWith({
      transcript: "hello there",
      transcribedAt: row.transcribedAt,
    })
    expect(result).toEqual(row)
  })

  test("also persists diarized transcriptSegments when provided (Meta-native VoIP)", async () => {
    const segments = [
      { speaker: "Business", channel: 0, start: 0, end: 1.2, text: "Hello" },
      { speaker: "Customer", channel: 1, start: 1.5, end: 3, text: "Hi there" },
    ]
    const row = baseRow({
      transcript: "Hello Hi there",
      transcribedAt: new Date(),
      transcriptSegments: segments,
    })
    const chain = createUpdateChain([row])

    const result = await whatsappCallRepository.attachTranscript(
      {
        id: "call-1",
        transcript: "Hello Hi there",
        transcribedAt: row.transcribedAt as Date,
        segments,
      },
      chain as never,
    )

    expect(chain.set).toHaveBeenCalledWith({
      transcript: "Hello Hi there",
      transcribedAt: row.transcribedAt,
      transcriptSegments: segments,
    })
    expect(result).toEqual(row)
  })

  test("is a no-op (undefined) when the row already has a transcript", async () => {
    const chain = createUpdateChain([])

    const result = await whatsappCallRepository.attachTranscript(
      { id: "call-1", transcript: "redelivered", transcribedAt: new Date() },
      chain as never,
    )

    expect(result).toBeUndefined()
  })
})

describe("whatsappCallRepository.attachAiSummary", () => {
  test("persists the summary, provider, and aiSummarizedAt exactly once", async () => {
    const aiSummarizedAt = new Date("2026-09-01T00:00:00.000Z")
    const aiSummary = { summary: "Customer asked about pricing." }
    const row = baseRow({
      aiSummary,
      aiSummaryProvider: "openai",
      aiSummarizedAt,
    })
    const chain = createUpdateChain([row])

    const result = await whatsappCallRepository.attachAiSummary(
      {
        id: "call-1",
        aiSummary,
        aiSummaryProvider: "openai",
        aiSummarizedAt,
      },
      chain as never,
    )

    expect(chain.set).toHaveBeenCalledWith({
      aiSummary,
      aiSummaryProvider: "openai",
      aiSummarizedAt,
    })
    expect(result).toEqual(row)
  })

  test("is a no-op (undefined) when the row already has aiSummarizedAt", async () => {
    const chain = createUpdateChain([])

    const result = await whatsappCallRepository.attachAiSummary(
      {
        id: "call-1",
        aiSummary: { summary: "redelivered" },
        aiSummaryProvider: "openai",
        aiSummarizedAt: new Date(),
      },
      chain as never,
    )

    expect(result).toBeUndefined()
  })
})

describe("whatsappCallRepository.createPendingOutbound initiatedByUserId", () => {
  test("stamps initiatedByUserId independently of answeredByUserId", async () => {
    const row = baseRow({
      direction: "businessInitiated",
      attemptId: "att-1",
      answeredByUserId: "agent-1",
      initiatedByUserId: "agent-1",
    })
    const tx = { insert: vi.fn(), values: vi.fn(), returning: vi.fn() }
    tx.insert.mockReturnValue(tx)
    tx.values.mockReturnValue(tx)
    tx.returning.mockResolvedValue([row])

    const result = await whatsappCallRepository.createPendingOutbound(
      {
        attemptId: "att-1",
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        answeredByUserId: "agent-1",
        initiatedByUserId: "agent-1",
      },
      tx as never,
    )

    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        answeredByUserId: "agent-1",
        initiatedByUserId: "agent-1",
      }),
    )
    expect(result).toEqual(row)
  })

  test("defaults initiatedByUserId to null when omitted", async () => {
    const row = baseRow({ direction: "businessInitiated", attemptId: "att-1" })
    const tx = { insert: vi.fn(), values: vi.fn(), returning: vi.fn() }
    tx.insert.mockReturnValue(tx)
    tx.values.mockReturnValue(tx)
    tx.returning.mockResolvedValue([row])

    await whatsappCallRepository.createPendingOutbound(
      {
        attemptId: "att-1",
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
      tx as never,
    )

    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({ initiatedByUserId: null }),
    )
  })
})
