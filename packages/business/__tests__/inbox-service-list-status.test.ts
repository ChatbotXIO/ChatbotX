import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  relationsFilterToSQL: vi.fn(() => "WHERE"),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { inboxModel: { findMany: mocks.findMany } },
    $count: mocks.count,
  },
  relationsFilterToSQL: mocks.relationsFilterToSQL,
}))

const { inboxService } = await import("../src/inbox/service")

describe("inboxService.list — status scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([])
    mocks.count.mockResolvedValue(0)
  })

  // Default stays connected-only: the public `/v1/inboxes` and `/v1/channels`
  // endpoints and the public link page all read through this method, and none
  // of them should start surfacing disconnected channels.
  test("defaults to connected inboxes only", async () => {
    await inboxService.list({ workspaceId: "ws-1" })

    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: "ws-1",
      status: "connected",
    })
  })

  // The Analytics dashboard's inbox cards must match Settings -> Channels,
  // which lists an integration whether or not its inbox is still connected.
  // Filtering these out made a disconnected channel vanish from one surface
  // while staying visible on the other, with nothing explaining why.
  test("statuses given -> scopes to exactly those, so disconnected can be included", async () => {
    await inboxService.list({
      workspaceId: "ws-1",
      statuses: ["connected", "disconnected"],
    })

    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: "ws-1",
      status: { in: ["connected", "disconnected"] },
    })
  })

  test("the row count is scoped the same way as the rows", async () => {
    await inboxService.list({
      workspaceId: "ws-1",
      statuses: ["connected", "disconnected"],
    })

    expect(mocks.relationsFilterToSQL.mock.calls[0][1]).toMatchObject({
      status: { in: ["connected", "disconnected"] },
    })
  })
})
