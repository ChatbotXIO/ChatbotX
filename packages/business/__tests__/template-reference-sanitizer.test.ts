// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ findExistingIds: vi.fn() }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  referenceExistenceRepository: { findExistingIds: mocks.findExistingIds },
  isVerifiableReferenceKind: (kind: string) =>
    ["inbox", "sequence", "tag"].includes(kind),
}))

const { sanitizeUnresolvedReferences } = await import(
  "../src/template/reference-sanitizer"
)

const graphWith = (step: Record<string, unknown>) => ({
  nodes: [{ id: "n", data: { details: { steps: [step] } } }],
  edges: [],
})
const slot = (key: string) => `nodes[0].data.details.steps[0].${key}`
const stepOf = (graph: ReturnType<typeof graphWith>) =>
  graph.nodes[0]?.data.details.steps[0]
const run = (
  graph: ReturnType<typeof graphWith>,
  unresolved: { entityKind: string; path: string; value: string }[],
  cache?: Map<string, boolean>,
  verifyKinds?: ReadonlySet<string>,
) =>
  sanitizeUnresolvedReferences({
    workspaceId: "ws-1",
    graph,
    unresolved,
    tx: {} as never,
    cache,
    verifyKinds,
  })

describe("sanitizeUnresolvedReferences", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findExistingIds.mockResolvedValue(new Set())
  })

  test("removes an unresolved natural-key id", async () => {
    const graph = graphWith({
      id: "s",
      stepType: "setCustomField",
      inputFieldId: "77",
    })

    const cleaned = await run(graph, [
      { entityKind: "customField", path: slot("inputFieldId"), value: "77" },
    ])

    expect(stepOf(cleaned)?.inputFieldId).toBe("")
  })

  test("verifyKinds judges a natural-key kind by existence in the importing workspace", async () => {
    mocks.findExistingIds.mockResolvedValue(new Set(["5"]))
    const graph = graphWith({ id: "s", stepType: "addTag", tagId: "5" })
    const foreign = graphWith({ id: "s", stepType: "addTag", tagId: "6" })
    const verify = new Set(["tag"])

    const kept = await run(
      graph,
      [{ entityKind: "tag", path: slot("tagId"), value: "5" }],
      undefined,
      verify,
    )
    const removed = await run(
      foreign,
      [{ entityKind: "tag", path: slot("tagId"), value: "6" }],
      undefined,
      verify,
    )

    expect(stepOf(kept)?.tagId).toBe("5")
    expect(stepOf(removed)?.tagId).toBe("")
    expect(mocks.findExistingIds).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", kind: "tag" }),
      expect.anything(),
    )
  })

  test("without verifyKinds an unresolved natural-key id is removed unconditionally", async () => {
    const graph = graphWith({ id: "s", stepType: "addTag", tagId: "5" })

    const cleaned = await run(graph, [
      { entityKind: "tag", path: slot("tagId"), value: "5" },
    ])

    expect(stepOf(cleaned)?.tagId).toBe("")
    expect(mocks.findExistingIds).not.toHaveBeenCalled()
  })

  test("never touches a system-field slug sharing a custom-field slot", async () => {
    const graph = graphWith({
      id: "s",
      stepType: "setCustomField",
      inputFieldId: "first_name",
    })

    const cleaned = await run(graph, [
      {
        entityKind: "customField",
        path: slot("inputFieldId"),
        value: "first_name",
      },
    ])

    expect(stepOf(cleaned)?.inputFieldId).toBe("first_name")
  })

  test("a kind that cannot be verified (integration) is left as written", async () => {
    const graph = graphWith({
      id: "s",
      stepType: "email",
      integrationSmtpId: "5",
    })

    const cleaned = await run(graph, [
      {
        entityKind: "integration",
        path: slot("integrationSmtpId"),
        value: "5",
      },
    ])

    expect(stepOf(cleaned)?.integrationSmtpId).toBe("5")
    expect(mocks.findExistingIds).not.toHaveBeenCalled()
  })

  test("a scalar assignee id is stripped but the unassigned sentinel is kept", async () => {
    const graph = graphWith({
      id: "s",
      stepType: "assignConversation",
      assignedId: "u_5",
    })
    const sentinel = graphWith({
      id: "s",
      stepType: "assignConversation",
      assignedId: "unassigned",
    })

    const cleaned = await run(graph, [
      { entityKind: "workspaceMember", path: slot("assignedId"), value: "u_5" },
    ])
    const kept = await run(sentinel, [
      {
        entityKind: "workspaceMember",
        path: slot("assignedId"),
        value: "unassigned",
      },
    ])

    expect(stepOf(cleaned)?.assignedId).toBe("")
    expect(stepOf(kept)?.assignedId).toBe("unassigned")
  })

  test("an array element the remap already stripped is not removed a second time", async () => {
    // The walk already dropped "u_1"; the array now holds only the survivor.
    const graph = graphWith({
      id: "s",
      stepType: "autoAssignConversation",
      assignedIds: ["u_2"],
    })

    const cleaned = await run(graph, [
      {
        entityKind: "workspaceMember",
        path: slot("assignedIds[0]"),
        value: "u_1",
      },
    ])

    expect(stepOf(cleaned)?.assignedIds).toEqual(["u_2"])
  })

  test("keeps a verifyInTarget id that exists and removes one that does not, in one query", async () => {
    mocks.findExistingIds.mockResolvedValue(new Set(["500"]))
    const graph = graphWith({
      id: "s",
      stepType: "subscribeSequence",
      sequenceId: "600",
    })

    const cleaned = await run(graph, [
      { entityKind: "sequence", path: slot("sequenceId"), value: "600" },
      { entityKind: "sequence", path: "edges[0].x", value: "500" },
    ])

    expect(stepOf(cleaned)).not.toHaveProperty("sequenceId")
    expect(mocks.findExistingIds).toHaveBeenCalledTimes(1)
  })

  test("a shared cache means a repeated id is looked up only once across flows", async () => {
    const cache = new Map<string, boolean>()
    const unresolved = [
      { entityKind: "inbox", path: slot("inboxId"), value: "9" },
    ]

    await run(
      graphWith({ id: "s", stepType: "sendWaTemplateMessage", inboxId: "9" }),
      unresolved,
      cache,
    )
    await run(
      graphWith({ id: "s", stepType: "sendWaTemplateMessage", inboxId: "9" }),
      unresolved,
      cache,
    )

    expect(mocks.findExistingIds).toHaveBeenCalledTimes(1)
  })
})
