import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findItem: vi.fn(),
  findInbox: vi.fn(),
  freeze: vi.fn(),
  findIntegrationIdByInbox: vi.fn(),
  lockIntegration: vi.fn(),
  lockOwedFollowUp: vi.fn(),
  linkFollowUpRun: vi.fn(),
  failFollowUp: vi.fn(),
  expireOwedFollowUps: vi.fn(),
  listOwedFollowUps: vi.fn(),
  enable: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactSyncRunItemModel: { findFirst: mocks.findItem },
      inboxModel: { findFirst: mocks.findInbox },
    },
    transaction: (fn: (tx: unknown) => unknown) => fn({ tx: true }),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  coexistSyncRunRepository: {
    findIntegrationIdByInbox: mocks.findIntegrationIdByInbox,
    lockIntegration: mocks.lockIntegration,
  },
  contactSyncRunRepository: {
    lockOwedFollowUp: mocks.lockOwedFollowUp,
    linkFollowUpRun: mocks.linkFollowUpRun,
    failFollowUp: mocks.failFollowUp,
    expireOwedFollowUps: mocks.expireOwedFollowUps,
    listOwedFollowUps: mocks.listOwedFollowUps,
  },
}))
vi.mock("../../coexist/service", () => ({
  coexistService: { enable: mocks.enable },
}))
vi.mock("../../workspace-lifecycle/with-blocked-owner-guard", () => ({
  resolveWorkspaceFreezeReasonById: mocks.freeze,
}))

const { handOffContactSyncFollowUp, sweepContactSyncFollowUps } = await import(
  "../follow-up"
)

const item = {
  id: "item-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  followUpCoexist: true,
  followUpRunId: null,
  followUpError: null,
  followUpAiReadsSyncedHistory: true,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.findItem.mockResolvedValue(item)
  mocks.freeze.mockResolvedValue({ freezeReason: null })
  mocks.findInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
  mocks.findIntegrationIdByInbox.mockResolvedValue("int-1")
  mocks.lockOwedFollowUp.mockResolvedValue(item)
  mocks.enable.mockResolvedValue({ success: true, runId: "coexist-1" })
  mocks.linkFollowUpRun.mockResolvedValue(true)
})

describe("handOffContactSyncFollowUp", () => {
  test("enables coexist with the item's own AI choice inside the caller transaction and links the run", async () => {
    await expect(handOffContactSyncFollowUp("item-1")).resolves.toEqual({
      outcome: "linked",
      coexistRunId: "coexist-1",
    })

    expect(mocks.enable).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        integrationId: "int-1",
        channel: "messenger",
        aiReadsSyncedHistory: true,
      },
      { tx: true },
    )
    expect(mocks.linkFollowUpRun).toHaveBeenCalledWith(
      { itemId: "item-1", runId: "coexist-1" },
      { tx: true },
    )
  })

  test("the integration row is locked before the item row (no lock-order deadlock with a connect)", async () => {
    await handOffContactSyncFollowUp("item-1")

    expect(mocks.lockIntegration.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.lockOwedFollowUp.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test.each([
    ["an item that is not found", null],
    ["a follow-up already linked", { ...item, followUpRunId: "x" }],
    ["a follow-up already ended", { ...item, followUpError: "cancelled" }],
    ["an item that never owed one", { ...item, followUpCoexist: false }],
  ])("%s is not owed and changes nothing", async (_label, row) => {
    mocks.findItem.mockResolvedValue(row)

    await expect(handOffContactSyncFollowUp("item-1")).resolves.toEqual({
      outcome: "notOwed",
    })
    expect(mocks.enable).not.toHaveBeenCalled()
  })

  test("a duplicate delivery that lost the race under the lock does nothing", async () => {
    mocks.lockOwedFollowUp.mockResolvedValue(null)

    await expect(handOffContactSyncFollowUp("item-1")).resolves.toEqual({
      outcome: "notOwed",
    })
    expect(mocks.enable).not.toHaveBeenCalled()
    expect(mocks.linkFollowUpRun).not.toHaveBeenCalled()
  })

  test("a frozen workspace ends the follow-up without starting coexist", async () => {
    mocks.freeze.mockResolvedValue({ freezeReason: "ownerBlocked" })

    await expect(handOffContactSyncFollowUp("item-1")).resolves.toEqual({
      outcome: "failed",
      error: "workspaceUnavailable",
    })
    expect(mocks.failFollowUp).toHaveBeenCalledWith({
      itemId: "item-1",
      error: "workspaceUnavailable",
    })
    expect(mocks.enable).not.toHaveBeenCalled()
  })

  test.each([
    ["an inbox that is gone", null],
    ["a channel with no history sync", { id: "inbox-1", channel: "zalo" }],
  ])("%s ends the follow-up as channelUnavailable", async (_label, inbox) => {
    mocks.findInbox.mockResolvedValue(inbox)

    await expect(handOffContactSyncFollowUp("item-1")).resolves.toEqual({
      outcome: "failed",
      error: "channelUnavailable",
    })
    expect(mocks.enable).not.toHaveBeenCalled()
  })

  test("a refused enable because a newer import owes the history ends it as superseded", async () => {
    mocks.enable.mockResolvedValue({
      success: false,
      reason: "contact_import_running",
    })

    await expect(handOffContactSyncFollowUp("item-1")).resolves.toEqual({
      outcome: "failed",
      error: "superseded",
    })
    expect(mocks.linkFollowUpRun).not.toHaveBeenCalled()
  })

  test("an integration that vanished ends the follow-up as channelUnavailable", async () => {
    mocks.enable.mockResolvedValue({ success: false, reason: "not_found" })

    await expect(handOffContactSyncFollowUp("item-1")).resolves.toEqual({
      outcome: "failed",
      error: "channelUnavailable",
    })
  })
})

describe("sweepContactSyncFollowUps", () => {
  test("expires old follow-ups first, then hands off the owed batch, surviving one failure", async () => {
    mocks.listOwedFollowUps.mockResolvedValue([
      { id: "item-1", workspaceId: "ws-1" },
      { id: "item-2", workspaceId: "ws-1" },
    ])
    mocks.findItem
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce(item)

    await expect(sweepContactSyncFollowUps()).resolves.toBe(1)

    expect(mocks.expireOwedFollowUps).toHaveBeenCalledWith({
      maxAgeHours: 24,
      batchSize: 50,
    })
    expect(mocks.listOwedFollowUps).toHaveBeenCalledWith({ batchSize: 50 })
    expect(mocks.expireOwedFollowUps.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listOwedFollowUps.mock.invocationCallOrder[0] ?? 0,
    )
  })
})
