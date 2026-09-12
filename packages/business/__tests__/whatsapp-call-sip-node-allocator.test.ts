import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  runExclusive: vi.fn(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  ),
  pinOrGet: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  workspaceSipNodeRepository: { pinOrGet: mocks.pinOrGet },
}))

const { chooseLeastLoadedNode, pinWorkspaceToNode } = await import(
  "../src/whatsapp-call/sip-node-allocator"
)

beforeEach(() => {
  mocks.runExclusive.mockClear()
  mocks.pinOrGet.mockClear()
})

describe("chooseLeastLoadedNode", () => {
  test("picks the node with fewer pins", () => {
    expect(chooseLeastLoadedNode(["a", "b"], { a: 5, b: 2 })).toBe("b")
  })

  test("a node absent from counts (zero pins) is eligible", () => {
    expect(chooseLeastLoadedNode(["a", "b"], { a: 3 })).toBe("b")
  })

  test("stable tie-break: first node id wins", () => {
    expect(chooseLeastLoadedNode(["a", "b"], { a: 1, b: 1 })).toBe("a")
  })

  test("throws when there are no nodes configured", () => {
    expect(() => chooseLeastLoadedNode([], {})).toThrow()
  })
})

describe("pinWorkspaceToNode", () => {
  test("runs pinOrGet inside distributedLock.runExclusive with the freeswitch-node-alloc key", async () => {
    mocks.pinOrGet.mockResolvedValue({ workspaceId: "ws-1", nodeId: "a" })

    const result = await pinWorkspaceToNode({
      workspaceId: "ws-1",
      nodeIds: ["a", "b"],
    })

    expect(result).toEqual({ nodeId: "a" })
    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "freeswitch-node-alloc",
        timeoutInSeconds: 10,
      }),
    )
    expect(mocks.pinOrGet).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
  })

  test("the chooseNode callback passed to the repository uses the least-loaded rule", async () => {
    mocks.pinOrGet.mockImplementation(
      async (input: { chooseNode: (c: Record<string, number>) => string }) => ({
        workspaceId: "ws-1",
        nodeId: input.chooseNode({ a: 10, b: 1 }),
      }),
    )

    const result = await pinWorkspaceToNode({
      workspaceId: "ws-1",
      nodeIds: ["a", "b"],
    })
    expect(result).toEqual({ nodeId: "b" })
  })
})
