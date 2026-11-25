import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureForInboxes: vi.fn(),
  findBindingsByInbox: vi.fn(),
  findIdsInWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: { kind: "db" } }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  MAX_PUBLISH_INBOXES_PER_PROVIDER: 200,
  publishDestinationRepository: {
    ensureForInboxes: mocks.ensureForInboxes,
    findBindingsByInbox: mocks.findBindingsByInbox,
    findIdsInWorkspace: mocks.findIdsInWorkspace,
  },
  publishDestinationStateRepository: {},
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  invalidateCacheByTags: vi.fn(),
}))

const { publishDestinationService } = await import(
  "../src/publish-destination/service"
)
const { mapDestinationScopeError } = await import(
  "../src/publish-destination/errors"
)

beforeEach(() => {
  vi.resetAllMocks()
})

describe("publishDestinationService.resolveRefs", () => {
  test("a destinationId of another workspace is rejected before anything is written", async () => {
    mocks.findIdsInWorkspace.mockResolvedValue(["pd-1"])

    await expect(
      publishDestinationService.resolveRefs({
        refs: [{ destinationId: "pd-1" }, { destinationId: "foreign" }],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "targets.1.destinationId" })
    expect(mocks.ensureForInboxes).not.toHaveBeenCalled()
  })

  test("a destinationId passes through and an inboxId resolves to its binding", async () => {
    mocks.findIdsInWorkspace.mockResolvedValue(["pd-1"])
    mocks.ensureForInboxes.mockResolvedValue([{ id: "pd-2", inboxId: "i-2" }])

    const ids = await publishDestinationService.resolveRefs({
      refs: [{ destinationId: "pd-1" }, { inboxId: "i-2" }],
      workspaceId: "ws-1",
    })

    expect(ids).toEqual(["pd-1", "pd-2"])
    expect(mocks.ensureForInboxes).toHaveBeenCalledWith(
      { inboxIds: ["i-2"], workspaceId: "ws-1" },
      expect.anything(),
    )
  })

  test("exactly one of destinationId or inboxId", async () => {
    await expect(
      publishDestinationService.resolveRefs({
        refs: [{ destinationId: "pd-1", inboxId: "i-1" }],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "targets.0" })
    await expect(
      publishDestinationService.resolveRefs({
        refs: [{}],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "targets.0" })
  })

  test("an inbox that cannot publish or is another workspace's is refused", async () => {
    mocks.ensureForInboxes.mockResolvedValue([])
    await expect(
      publishDestinationService.resolveRefs({
        refs: [{ inboxId: "foreign" }],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "targets.0.inboxId" })
  })
})

describe("mapDestinationScopeError", () => {
  test("a cross-workspace write becomes a not-found; other errors pass through", () => {
    const scope = new Error("x")
    scope.name = "PublishDestinationWorkspaceError"
    expect(mapDestinationScopeError(scope)).toMatchObject({ code: "notFound" })
    const other = new Error("boom")
    expect(mapDestinationScopeError(other)).toBe(other)
  })
})
