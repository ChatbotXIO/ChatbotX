import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { aiHandoverSettingsRepository } from "../src/repositories/ai-handover-settings/repository"
import { aiHandoverSettingsModel } from "../src/schema"

const dialect = new PgDialect()
const REF = { workspaceId: "ws-1", inboxId: "inbox-1" }
const SETTINGS = {
  enabled: true,
  scheduleEnabled: true,
  timeRanges: [{ from: 8, to: 17 }],
  gotoFlowId: "flow-1",
  returnMessage: "Back with you",
  pauseBotWaitingForStaff: true,
}

const buildUpsertTx = (returned: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(returned)
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
  const insert = vi.fn().mockReturnValue({ values })
  return {
    tx: { insert } as unknown as DatabaseClient,
    insert,
    values,
    onConflictDoUpdate,
  }
}

const buildSelectTx = (rows: unknown[]) => {
  const forUpdate = vi.fn().mockResolvedValue(rows)
  const limit = vi
    .fn()
    .mockReturnValue(Object.assign(Promise.resolve(rows), { for: forUpdate }))
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return {
    from,
    where,
    limit,
    forUpdate,
    select: vi.fn().mockReturnValue({ from }),
  }
}

describe("aiHandoverSettingsRepository.upsert", () => {
  test("writes every setting explicitly, with the apply-to-all state off, and replaces only the settings on conflict", async () => {
    const row = { id: "bas-1", ...REF, channel: "messenger" }
    const { tx, insert, values, onConflictDoUpdate } = buildUpsertTx([row])

    const result = await aiHandoverSettingsRepository.upsert(
      { ...REF, channel: "messenger", ...SETTINGS },
      tx,
    )

    expect(result).toBe(row)
    expect(insert).toHaveBeenCalledWith(aiHandoverSettingsModel)
    // No column is left to a database default.
    expect(values).toHaveBeenCalledWith({
      ...REF,
      channel: "messenger",
      ...SETTINGS,
      applyToAllCustomers: false,
      applyToAllRevision: 0,
      applyToAllMessage: null,
      applyToAllRequestedByUserId: null,
    })
    // A save never touches the apply-to-all state or its revision.
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: aiHandoverSettingsModel.inboxId,
      set: SETTINGS,
    })
  })

  test("can clear the optional settings", async () => {
    const { tx, onConflictDoUpdate } = buildUpsertTx([{ id: "bas-1" }])

    await aiHandoverSettingsRepository.upsert(
      {
        ...REF,
        channel: "messenger",
        ...SETTINGS,
        gotoFlowId: null,
        returnMessage: null,
      },
      tx,
    )

    expect(onConflictDoUpdate.mock.calls[0][0].set).toMatchObject({
      gotoFlowId: null,
      returnMessage: null,
    })
  })

  test("throws when the write returns no row", async () => {
    const { tx } = buildUpsertTx([])
    await expect(
      aiHandoverSettingsRepository.upsert(
        { ...REF, channel: "messenger", ...SETTINGS },
        tx,
      ),
    ).rejects.toThrow("Failed to upsert business AI settings")
  })
})

describe("aiHandoverSettingsRepository.findByInbox", () => {
  test("returns the Page's row, scoped by workspace AND inbox", async () => {
    const row = { id: "bas-1" }
    const { select, from, where, limit } = buildSelectTx([row])
    const tx = { select } as unknown as DatabaseClient

    await expect(
      aiHandoverSettingsRepository.findByInbox(REF, tx),
    ).resolves.toBe(row)

    expect(from).toHaveBeenCalledWith(aiHandoverSettingsModel)
    expect(limit).toHaveBeenCalledWith(1)
    expect(dialect.sqlToQuery(where.mock.calls[0][0]).params).toEqual([
      "ws-1",
      "inbox-1",
    ])
  })

  test("returns null when nothing was saved", async () => {
    const { select } = buildSelectTx([])

    await expect(
      aiHandoverSettingsRepository.findByInbox(REF, {
        select,
      } as unknown as DatabaseClient),
    ).resolves.toBeNull()
  })
})

describe("aiHandoverSettingsRepository.lockExisting", () => {
  /** Two selects in order: the locking settings read, then the Inbox status. */
  const buildLockExistingTx = (
    settings: unknown[],
    inbox: unknown[],
    extra: object = {},
  ) => {
    const forUpdate = vi.fn().mockResolvedValue(settings)
    const settingsLimit = vi
      .fn()
      .mockReturnValue(
        Object.assign(Promise.resolve(settings), { for: forUpdate }),
      )
    const inboxLimit = vi.fn().mockResolvedValue(inbox)
    const calls: string[] = []
    const select = vi.fn().mockImplementation((fields?: object) => {
      if (fields && "status" in fields) {
        calls.push("inbox")
        return { from: () => ({ where: () => ({ limit: inboxLimit }) }) }
      }
      calls.push("settings")
      return { from: () => ({ where: () => ({ limit: settingsLimit }) }) }
    })
    return {
      tx: { select, ...extra } as unknown as DatabaseClient,
      forUpdate,
      calls,
    }
  }

  test("lockExisting locks the settings row FOR UPDATE alone, then reads the Page's status in a statement of its own, and never creates a row", async () => {
    const insert = vi.fn()
    const { tx, forUpdate, calls } = buildLockExistingTx(
      [{ id: "bas-1" }],
      [{ status: "connected" }],
      { insert },
    )

    await expect(
      aiHandoverSettingsRepository.lockExisting(REF, tx),
    ).resolves.toEqual({
      settings: { id: "bas-1" },
      inboxStatus: "connected",
    })

    // The status is read AFTER the lock, in a fresh snapshot: a disconnect that
    // committed while we waited for the lock is seen.
    expect(forUpdate).toHaveBeenCalledWith("update")
    expect(calls).toEqual(["settings", "inbox"])
    expect(insert).not.toHaveBeenCalled()
  })

  test("lockExisting returns null for a Page without settings, without reading the status", async () => {
    const { tx, calls } = buildLockExistingTx([], [])

    await expect(
      aiHandoverSettingsRepository.lockExisting(REF, tx),
    ).resolves.toBeNull()
    expect(calls).toEqual(["settings"])
  })

  test("a Page whose inbox row is gone counts as disconnected", async () => {
    const { tx } = buildLockExistingTx([{ id: "bas-1" }], [])

    await expect(
      aiHandoverSettingsRepository.lockExisting(REF, tx),
    ).resolves.toMatchObject({ inboxStatus: "disconnected" })
  })
})

describe("aiHandoverSettingsRepository.lockForApplyToAll", () => {
  const buildLockTx = (settings: unknown[]) => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn().mockReturnValue({ onConflictDoNothing })
    const insert = vi.fn().mockReturnValue({ values })
    const forUpdate = vi.fn().mockResolvedValue(settings)
    const settingsLimit = vi
      .fn()
      .mockReturnValue(
        Object.assign(Promise.resolve(settings), { for: forUpdate }),
      )
    const inboxLimit = vi.fn().mockResolvedValue([{ status: "connected" }])
    const select = vi
      .fn()
      .mockImplementation((fields?: object) =>
        fields && "status" in fields
          ? { from: () => ({ where: () => ({ limit: inboxLimit }) }) }
          : { from: () => ({ where: () => ({ limit: settingsLimit }) }) },
      )
    return {
      tx: { insert, select } as unknown as DatabaseClient,
      values,
      onConflictDoNothing,
      forUpdate,
    }
  }

  test("creates a switched-off row when the Page has none, then locks it FOR UPDATE", async () => {
    const { tx, values, onConflictDoNothing, forUpdate } = buildLockTx([
      { id: "bas-1" },
    ])

    await expect(
      aiHandoverSettingsRepository.lockForApplyToAll(
        { ...REF, channel: "messenger" },
        tx,
      ),
    ).resolves.toEqual({
      settings: { id: "bas-1" },
      inboxStatus: "connected",
    })

    expect(values.mock.calls[0][0]).toMatchObject({
      ...REF,
      enabled: false,
      applyToAllCustomers: false,
      applyToAllRevision: 0,
    })
    // Never overwrites an existing row.
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: aiHandoverSettingsModel.inboxId,
    })
    expect(forUpdate).toHaveBeenCalledWith("update")
  })

  test("throws when the row cannot be read back", async () => {
    const { tx } = buildLockTx([])

    await expect(
      aiHandoverSettingsRepository.lockForApplyToAll(
        { ...REF, channel: "messenger" },
        tx,
      ),
    ).rejects.toThrow("Failed to lock business AI settings")
  })
})

describe("aiHandoverSettingsRepository.setApplyToAll", () => {
  const buildSetTx = (current: unknown[], updated: unknown[]) => {
    const returning = vi.fn().mockResolvedValue(updated)
    const where = vi.fn().mockReturnValue({ returning })
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const selectChain = buildSelectTx(current)
    return {
      tx: { update, select: selectChain.select } as unknown as DatabaseClient,
      set,
    }
  }

  test("records the new state with the next revision, who asked and the message", async () => {
    const { tx, set } = buildSetTx(
      [{ applyToAllRevision: 4 }],
      [{ id: "bas-1" }],
    )

    await aiHandoverSettingsRepository.setApplyToAll(
      {
        ...REF,
        applyToAllCustomers: false,
        applyToAllMessage: "A person is here",
        requestedByUserId: "user-1",
      },
      tx,
    )

    expect(set).toHaveBeenCalledWith({
      applyToAllCustomers: false,
      applyToAllRevision: 5,
      applyToAllMessage: "A person is here",
      applyToAllRequestedByUserId: "user-1",
    })
  })

  test("the first change of a Page is revision 1", async () => {
    const { tx, set } = buildSetTx([], [{ id: "bas-1" }])

    await aiHandoverSettingsRepository.setApplyToAll(
      {
        ...REF,
        applyToAllCustomers: true,
        applyToAllMessage: null,
        requestedByUserId: null,
      },
      tx,
    )

    expect(set.mock.calls[0][0].applyToAllRevision).toBe(1)
  })

  test("throws when no row was updated", async () => {
    const { tx } = buildSetTx([{ applyToAllRevision: 0 }], [])

    await expect(
      aiHandoverSettingsRepository.setApplyToAll(
        {
          ...REF,
          applyToAllCustomers: true,
          applyToAllMessage: null,
          requestedByUserId: null,
        },
        tx,
      ),
    ).rejects.toThrow("Failed to record the apply-to-all change")
  })
})
