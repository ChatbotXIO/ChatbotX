import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emitSocialPostChanged: vi.fn(),
  info: vi.fn(),
  runScopeRecheck: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: string, run: () => Promise<void>) => await run(),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  emitSocialPostChanged: mocks.emitSocialPostChanged,
  publishScopeRecheckService: { runScopeRecheck: mocks.runScopeRecheck },
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))
vi.mock("@chatbotx.io/channel-registry/publish-scope-ops", () => ({
  createPublishScopeOps: () => ({ kind: "ops" }),
}))
vi.mock("../src/lib/logger", () => ({ logger: { info: mocks.info } }))

const { recheckPublishDestinationScopes } = await import(
  "../src/publish-destination/recheck-scopes"
)

const data = { destinationIds: ["d1", "d2"], workspaceId: "ws-1" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("recheckPublishDestinationScopes", () => {
  test("runs under the blocked-owner guard with the platform ops", async () => {
    mocks.runScopeRecheck.mockResolvedValue({
      outcomes: [],
      rateLimited: false,
      written: false,
    })

    await recheckPublishDestinationScopes(data)

    expect(mocks.withBlockedOwnerGuard.mock.calls[0]?.[0]).toBe("ws-1")
    expect(mocks.runScopeRecheck).toHaveBeenCalledWith(data, { kind: "ops" })
  })

  test("tells the open Connect tab once when something was written", async () => {
    mocks.runScopeRecheck.mockResolvedValue({
      outcomes: ["written", "written"],
      rateLimited: false,
      written: true,
    })

    await recheckPublishDestinationScopes(data)

    expect(mocks.emitSocialPostChanged).toHaveBeenCalledTimes(1)
    expect(mocks.emitSocialPostChanged).toHaveBeenCalledWith({
      socialPostId: "",
      status: "scopesRechecked",
      workspaceId: "ws-1",
    })
  })

  test("emits nothing when nothing was written (rate limit, invalid token, lost fence)", async () => {
    mocks.runScopeRecheck.mockResolvedValue({
      outcomes: ["rateLimited"],
      rateLimited: true,
      written: false,
    })

    await recheckPublishDestinationScopes(data)

    expect(mocks.emitSocialPostChanged).not.toHaveBeenCalled()
  })
})
