import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ discover: vi.fn() }))

vi.mock("../providers", () => ({
  contactSyncAdapters: { ahachat: { discoverPages: mocks.discover } },
}))

const { discoverContactSyncPages } = await import("../discovery")
const {
  clearDiscoveryCache,
  DISCOVERY_CACHE_MAX_ENTRIES_PER_WORKSPACE,
  DISCOVERY_CACHE_TTL_MS,
  readDiscoveryCache,
  writeDiscoveryCache,
} = await import("../discovery-cache")

const SCOPE = {
  workspaceId: "ws-1",
  actor: { type: "user" as const, id: "u1" },
}
const inbox = (id: string) => ({
  id,
  name: id,
  channel: "messenger" as const,
  sourceId: `page-${id}`,
})
const answer = (
  id: string,
  status: "found" | "absent" | "ambiguous" | "unavailable" = "found",
) => ({
  channel: "messenger" as const,
  pageId: `page-${id}`,
  status,
  name: null,
  avatarUrl: null,
})

beforeEach(() => {
  vi.resetAllMocks()
  clearDiscoveryCache()
})

describe("discoverContactSyncPages cache", () => {
  test("a page answered once is not asked again within the window", async () => {
    mocks.discover.mockResolvedValue([answer("a")])

    await discoverContactSyncPages({
      provider: "ahachat",
      scope: SCOPE,
      inboxes: [inbox("a")],
    })
    await discoverContactSyncPages({
      provider: "ahachat",
      scope: SCOPE,
      inboxes: [inbox("a")],
    })

    expect(mocks.discover).toHaveBeenCalledTimes(1)
  })

  test("only the pages not remembered are asked", async () => {
    mocks.discover
      .mockResolvedValueOnce([answer("a")])
      .mockResolvedValueOnce([answer("b")])

    await discoverContactSyncPages({
      provider: "ahachat",
      scope: SCOPE,
      inboxes: [inbox("a")],
    })
    const result = await discoverContactSyncPages({
      provider: "ahachat",
      scope: SCOPE,
      inboxes: [inbox("a"), inbox("b")],
    })

    expect(mocks.discover.mock.calls[1]?.[1]).toEqual([
      { channel: "messenger", pageId: "page-b" },
    ])
    expect([...result.keys()].sort()).toEqual([
      "messenger:page-a",
      "messenger:page-b",
    ])
  })

  test("an unavailable answer is never remembered, so a retry asks again", async () => {
    mocks.discover
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce([answer("a")])

    const first = await discoverContactSyncPages({
      provider: "ahachat",
      scope: SCOPE,
      inboxes: [inbox("a")],
    })
    const second = await discoverContactSyncPages({
      provider: "ahachat",
      scope: SCOPE,
      inboxes: [inbox("a")],
    })

    expect(first.get("messenger:page-a")?.status).toBe("unavailable")
    expect(second.get("messenger:page-a")?.status).toBe("found")
  })

  test("the cache is per workspace", async () => {
    mocks.discover.mockResolvedValue([answer("a")])

    await discoverContactSyncPages({
      provider: "ahachat",
      scope: SCOPE,
      inboxes: [inbox("a")],
    })
    await discoverContactSyncPages({
      provider: "ahachat",
      scope: { ...SCOPE, workspaceId: "ws-2" },
      inboxes: [inbox("a")],
    })

    expect(mocks.discover).toHaveBeenCalledTimes(2)
  })
})

describe("discovery cache bounds", () => {
  const scope = { provider: "ahachat" as const, workspaceId: "ws-1" }

  test("an entry expires after the window", () => {
    writeDiscoveryCache(scope, "k", answer("a"), 1000)

    expect(
      readDiscoveryCache(scope, "k", 1000 + DISCOVERY_CACHE_TTL_MS - 1),
    ).toBeDefined()
    expect(
      readDiscoveryCache(scope, "k", 1000 + DISCOVERY_CACHE_TTL_MS),
    ).toBeUndefined()
  })

  test("a workspace keeps at most the bounded number of entries, oldest out", () => {
    for (
      let index = 0;
      index <= DISCOVERY_CACHE_MAX_ENTRIES_PER_WORKSPACE;
      index += 1
    ) {
      writeDiscoveryCache(scope, `k${index}`, answer("a"), 0)
    }

    expect(readDiscoveryCache(scope, "k0", 1)).toBeUndefined()
    expect(
      readDiscoveryCache(
        scope,
        `k${DISCOVERY_CACHE_MAX_ENTRIES_PER_WORKSPACE}`,
        1,
      ),
    ).toBeDefined()
  })
})
