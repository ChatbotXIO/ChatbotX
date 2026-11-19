// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const listHistory = vi.hoisted(() => vi.fn())
vi.mock("@chatbotx.io/business", () => ({
  contactSyncService: { listHistory },
}))
vi.mock("@/features/contact-sync/lib/access", () => ({
  requireContactSyncAdmin: vi.fn(),
}))
vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
}))

const { listContactSyncHistory } = await import(
  "@/features/contact-sync/queries/list-contact-sync-history.queries"
)

const at = new Date("2030-01-01T08:00:00.000Z")

/** A repository row: the public fields plus the worker's own state. */
const STORED_RUN = {
  id: "7",
  workspaceId: "1",
  provider: "ahachat",
  status: "running",
  triggerSource: "app",
  trigger: "menu",
  syncTags: true,
  syncCustomFields: true,
  overwriteExisting: false,
  requestedByType: "user",
  requestedById: "9",
  claimToken: "lease-token",
  attempts: 1,
  chunkSeq: 3,
  pausedUntil: null,
  lastHeartbeatAt: at,
  currentError: null,
  createdAt: at,
  startedAt: at,
  finishedAt: null,
  items: [
    {
      id: "70",
      runId: "7",
      workspaceId: "1",
      position: 0,
      inboxId: "6",
      sourceChannel: "messenger",
      sourceAccountId: "page-a",
      boundReadAt: at,
      sourceAccountName: "Page A",
      status: "running",
      cursor: "1234",
      upperBoundId: "9999",
      createdCount: 1,
      updatedCount: 2,
      skippedCount: 0,
      failedCount: 0,
      skippedValueCount: 0,
      currentError: null,
      startedAt: at,
      finishedAt: null,
      followUpCoexist: false,
      followUpAiReadsSyncedHistory: false,
      followUpRunId: null,
      followUpError: null,
      followUpRequestedAt: null,
    },
  ],
}

beforeEach(() => {
  listHistory
    .mockReset()
    .mockResolvedValue({ data: [STORED_RUN], total: 1, pageCount: 1 })
})

describe("listContactSyncHistory", () => {
  test("hands the page only what the public API shows, no worker state", async () => {
    const result = await listContactSyncHistory({
      workspaceId: "1",
      page: 1,
      perPage: 10,
    })

    const [run] = result.data
    expect(run).not.toHaveProperty("claimToken")
    expect(run).not.toHaveProperty("lastHeartbeatAt")
    expect(run).not.toHaveProperty("workspaceId")
    expect(run?.items[0]).not.toHaveProperty("cursor")
    expect(run?.items[0]).not.toHaveProperty("upperBoundId")
    expect(run?.items[0]).not.toHaveProperty("boundReadAt")
    expect(run).not.toHaveProperty("requestedByUserId")
    expect(run?.items[0]?.createdCount).toBe(1)
    expect(result.total).toBe(1)
  })

  test.each([
    { page: 0, perPage: 10, expected: { page: 1, perPage: 10 } },
    { page: -3, perPage: -1, expected: { page: 1, perPage: 1 } },
    { page: 2, perPage: 0, expected: { page: 2, perPage: 1 } },
  ])("a page or size below 1 from the URL becomes 1 ($page, $perPage)", async ({
    page,
    perPage,
    expected,
  }) => {
    await listContactSyncHistory({ workspaceId: "1", page, perPage })

    expect(listHistory).toHaveBeenCalledWith({ workspaceId: "1", ...expected })
  })
})
