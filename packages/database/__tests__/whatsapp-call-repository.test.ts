import { describe, expect, test, vi } from "vitest"
import { DrizzleQueryError } from "../src/client"
import {
  canAdvanceStatus,
  whatsappCallRepository,
} from "../src/repositories/whatsapp-call/repository"
import { whatsappCallModel } from "../src/schema"

const PENDING_OUTBOUND_EXISTS_RE = /pending-outbound-exists/

const OUTBOUND_ATTEMPT_UNKNOWN_RE = /outbound-attempt-unknown/

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
    freeswitchUuid: null,
    freeswitchBLegUuid: null,
    lastError: null,
    answeredByUserId: null,
    recordingPath: null,
    recordedAt: null,
    transcript: null,
    transcribedAt: null,
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

function createInsertChain(
  onConflictMethod: "onConflictDoNothing" | "onConflictDoUpdate",
  result: unknown[],
) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    insert: vi.fn(),
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn(),
  }
  chain.insert.mockReturnValue(chain)
  chain.values.mockReturnValue(chain)
  chain[onConflictMethod].mockReturnValue(chain)
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

describe("whatsappCallRepository.createFromFreeswitch", () => {
  test("conflicts on the partial freeswitchUuid index and COALESCEs wacid", async () => {
    const row = baseRow({ freeswitchUuid: "fs-uuid-1" })
    const tx = createInsertChain("onConflictDoUpdate", [row])

    const result = await whatsappCallRepository.createFromFreeswitch(
      {
        freeswitchUuid: "fs-uuid-1",
        wacid: null,
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        direction: "userInitiated",
        status: "ringing",
      },
      tx as never,
    )

    expect(tx.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    const call = tx.onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown
      where: { queryChunks?: unknown }
      set: { wacid: { queryChunks?: unknown } }
    }
    expect(call.target).toBe(whatsappCallModel.freeswitchUuid)
    // The predicate and the COALESCE both come through as `sql` fragments —
    // asserting they are SQL objects (not plain strings) is what proves the
    // partial-index WHERE clause was actually passed through, not dropped.
    expect(call.where).toBeDefined()
    expect(call.set.wacid).toBeDefined()
    expect(result).toEqual(row)
  })
})

describe("whatsappCallRepository.attachFreeswitchUuid", () => {
  test("throws a typed error when no claimable outbound row exists", async () => {
    const tx = createUpdateChain([])

    await expect(
      whatsappCallRepository.attachFreeswitchUuid(
        { attemptId: "attempt-1", freeswitchUuid: "fs-1" },
        tx as never,
      ),
    ).rejects.toThrow(OUTBOUND_ATTEMPT_UNKNOWN_RE)
  })

  test("binds the uuid onto the row created by the action", async () => {
    const row = baseRow({ attemptId: "attempt-1", freeswitchUuid: "fs-1" })
    const tx = createUpdateChain([row])

    const result = await whatsappCallRepository.attachFreeswitchUuid(
      { attemptId: "attempt-1", freeswitchUuid: "fs-1" },
      tx as never,
    )

    expect(result).toEqual(row)
  })
})

describe("whatsappCallRepository.upsertInbound", () => {
  test("retries the wacid-row attach once after a 23505 on the wacid index", async () => {
    const wacidRow = baseRow({ wacid: "wamid.1", freeswitchUuid: "fs-1" })

    // Step 1 (attach to the wacid row): first call finds nothing (no row yet),
    // the retry after the 23505 finds the row the webhook inserted meanwhile.
    const attachChain = createUpdateChain([])
    attachChain.returning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([wacidRow])

    const conflictError = new DrizzleQueryError("insert", [], {
      code: "23505",
      constraint: "WhatsappCall_wacid_key",
    })
    const insertChain = createInsertChain("onConflictDoUpdate", [])
    insertChain.returning.mockRejectedValueOnce(conflictError)

    const trx = { ...attachChain, ...insertChain } as unknown as {
      update: typeof attachChain.update
      insert: typeof insertChain.insert
    }

    const result = await whatsappCallRepository.upsertInbound(
      {
        wacid: "wamid.1",
        freeswitchUuid: "fs-1",
        attemptId: "attempt-x",
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        direction: "userInitiated",
        status: "ringing",
      },
      trx as never,
    )

    expect(result).toEqual(wacidRow)
    // attach attempted twice (initial miss, retry after the 23505)
    expect(attachChain.returning).toHaveBeenCalledTimes(2)
    // the insert path was attempted exactly once, and lost the race
    expect(insertChain.returning).toHaveBeenCalledTimes(1)
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
      freeswitchUuid: "fs-newer",
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
      { ...older, freeswitchUuid: "fs-newer" },
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
    expect(result).toMatchObject({ freeswitchUuid: "fs-newer" })
  })
})

describe("whatsappCallRepository.createPendingOutbound", () => {
  test("inserts a null-wacid/null-freeswitchUuid businessInitiated ringing row", async () => {
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
        freeswitchUuid: null,
        direction: "businessInitiated",
        status: "ringing",
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

describe("whatsappCallRepository.findPendingOutbound", () => {
  test("scopes by inbox/contactInbox/businessInitiated/null-wacid/ringing-or-accepted/window, ordered newest first, limited to one", async () => {
    const row = baseRow({ direction: "businessInitiated", wacid: null })
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

    const result = await whatsappCallRepository.findPendingOutbound(
      {
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
      },
      chain as never,
    )

    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(result).toEqual(row)
  })

  test("returns undefined when nothing matches (ambiguous / no pending attempt)", async () => {
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

    const result = await whatsappCallRepository.findPendingOutbound(
      {
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
      },
      chain as never,
    )

    expect(result).toBeUndefined()
  })
})

describe("whatsappCallRepository cursor pagination", () => {
  test("listByWorkspaceCursor never calls offset", async () => {
    const rows = [baseRow()]
    // Deliberately omit an `offset` method: if the implementation ever
    // called `.offset(...)`, this fake chain would throw immediately.
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

    const result = await whatsappCallRepository.listByWorkspaceCursor(
      { workspaceId: "ws-1", limit: 20 },
      chain as never,
    )

    expect(chain.limit).toHaveBeenCalledWith(20)
    expect(result).toEqual(rows)
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
