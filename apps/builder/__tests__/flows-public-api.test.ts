import {
  FlowAuthoringException,
  sendMessageNodeDefaultFn,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const SPEC_STEP_PATH_PATTERN = /^steps\[/

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const flowService = {
  list: vi.fn(),
  findById: vi.fn(),
  createDraft: vi.fn(),
  createPublished: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  duplicate: vi.fn(),
}
const flowVersionService = {
  publish: vi.fn(),
  updateDraftByFlowId: vi.fn(),
  list: vi.fn(),
}
const importService = {
  startFlowImport: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  flowService,
  flowVersionService,
  importService,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  validationException: (field: string, message: string) =>
    new Error(`${field}: ${message}`),
}))

const getFlowAuthoringContext = vi.fn(async () => ({
  templatesByName: new Map(),
  customFieldsByName: new Map(),
  flowsByName: new Map(),
}))
vi.mock("@chatbotx.io/business/capabilities", () => ({
  getFlowAuthoringContext,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: { runImport: "runImport" },
  defaultQueue: { add: vi.fn() },
}))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    flowModel: {},
    flowVersionModel: {},
  }
})

await import("@/features/flows/api/public")
const { defaultQueue } = await import("@chatbotx.io/worker-config")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the flows public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/flows", () => {
  const procedure = findProcedure("GET", "/v1/flows")

  test("delegates to flowService.list", async () => {
    flowService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50, active: true },
    })

    expect(flowService.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      active: true,
      workspaceId: "workspace-1",
    })
  })

  test("returns only id and name per flow, not the full resource", async () => {
    flowService.list.mockResolvedValueOnce({
      data: [
        {
          id: "flow-1",
          name: "Flow 1",
          workspaceId: "workspace-1",
          active: true,
          flowVersions: [{ id: "version-1" }],
        },
      ],
      pageCount: 1,
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50, active: true },
    })

    expect(result).toEqual({
      data: [{ id: "flow-1", name: "Flow 1" }],
      pageCount: 1,
    })
  })
})

describe("GET /v1/flows/{id}", () => {
  const procedure = findProcedure("GET", "/v1/flows/{id}")

  test("delegates to flowService.findById", async () => {
    flowService.findById.mockResolvedValueOnce({ id: "flow-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "flow-1" },
    })

    expect(flowService.findById).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "flow-1",
    })
  })
})

describe("POST /v1/flows", () => {
  const procedure = findProcedure("POST", "/v1/flows")

  test("route metadata", () => {
    expect(procedure.route).toEqual(
      expect.objectContaining({
        method: "POST",
        path: "/v1/flows",
        successStatus: 201,
      }),
    )
  })

  test("delegates to flowService.createDraft", async () => {
    flowService.createDraft.mockResolvedValueOnce({ id: "flow-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "New flow" },
    })

    expect(flowService.createDraft).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "New flow" },
    })
  })

  test("spec content: createDraft receives a positioned graph and startNodeId; publish is not called", async () => {
    flowService.createDraft.mockResolvedValueOnce({ id: "flow-1" })

    const response = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        name: "New flow",
        folderId: null,
        spec: {
          formatVersion: 1,
          name: "Spec flow",
          steps: [{ type: "send", text: "Hi" }],
        },
      },
    })

    expect(flowService.createDraft).toHaveBeenCalledTimes(1)
    const call = flowService.createDraft.mock.calls[0][0]
    expect(call.data).toEqual({ name: "New flow", folderId: null })
    expect(call.graph.nodes).toHaveLength(1)
    expect(call.graph.nodes[0].position).toEqual({ x: 100, y: 100 })
    expect(call.graph.startNodeId).toBe(call.graph.nodes[0].id)
    expect(flowVersionService.publish).not.toHaveBeenCalled()
    expect(flowService.createPublished).not.toHaveBeenCalled()
    // A `{ spec }` graph has no authored node ids to report.
    expect(response.nodeIds).toBeUndefined()
  })

  test("raw graph content: createDraft receives normalized positions/edges and startNodeId", async () => {
    flowService.createDraft.mockResolvedValueOnce({ id: "flow-1" })

    const response = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        name: "New flow",
        folderId: null,
        nodes: [
          { id: "n1", type: "sendMessage", data: {} },
          { id: "n2", type: "sendMessage", data: {} },
        ],
        edges: [{ source: "n1", target: "n2" }],
      },
    })

    const call = flowService.createDraft.mock.calls[0][0]
    const [nodeN1, nodeN2] = call.graph.nodes
    // Authored ids ("n1"/"n2") are request-scoped wiring tokens, remapped to
    // fresh internal ids server-side — assert the relationship, not the
    // literal authored string.
    expect(nodeN1.id).not.toBe("n1")
    expect(nodeN2.id).not.toBe("n2")
    expect(nodeN1.position).toEqual({ x: 100, y: 100 })
    expect(call.graph.edges[0]).toEqual(
      expect.objectContaining({
        source: nodeN1.id,
        target: nodeN2.id,
        sourceHandle: nodeN1.id,
        targetHandle: nodeN2.id,
      }),
    )
    expect(call.graph.startNodeId).toBe(nodeN1.id)
    expect(flowVersionService.publish).not.toHaveBeenCalled()
    expect(flowService.createPublished).not.toHaveBeenCalled()
    // The response reports the authored → persisted id mapping so the
    // caller can edit the graph it just created without a `flows.get`.
    expect(response.nodeIds).toEqual({ n1: nodeN1.id, n2: nodeN2.id })
  })

  test("publish: true validates the graph and creates it atomically via flowService.createPublished, not createDraft + publish", async () => {
    flowService.createPublished.mockResolvedValueOnce({ id: "flow-9" })
    // Authored id is deliberately non-numeric ("n1") — normalizeAuthoredGraph
    // must remap it to an internal createId() id before publishFlowSchema
    // validates it, since baseNodeSchema.id requires digits only.
    const node = sendMessageNodeDefaultFn({
      nodeProps: { id: "n1" },
      dataProps: {},
      detailProps: {},
    })

    const response = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        name: "New flow",
        folderId: null,
        nodes: [node],
        edges: [],
        publish: true,
      },
    })

    expect(flowService.createDraft).not.toHaveBeenCalled()
    expect(flowVersionService.publish).not.toHaveBeenCalled()
    expect(flowService.createPublished).toHaveBeenCalledTimes(1)
    const createPublishedCall = flowService.createPublished.mock.calls[0][0]
    expect(createPublishedCall.workspaceId).toBe("workspace-1")
    expect(createPublishedCall.data).toEqual({
      name: "New flow",
      folderId: null,
    })
    expect(createPublishedCall.graph.nodes[0].id).not.toBe("n1")
    expect(response).toEqual({
      id: "flow-9",
      nodeIds: { n1: createPublishedCall.graph.nodes[0].id },
    })
  })

  test("publish: true rejects an invalid node before createDraft is called", async () => {
    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: {
          name: "New flow",
          folderId: null,
          nodes: [{ id: "n1", type: "sendMessage", data: {} }],
          edges: [],
          publish: true,
        },
      }),
    ).rejects.toBeInstanceOf(FlowAuthoringException)

    expect(flowService.createDraft).not.toHaveBeenCalled()
  })
})

describe("PATCH /v1/flows/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/flows/{id}")

  test("delegates to flowService.update", async () => {
    flowService.update.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "flow-1", name: "Renamed" },
    })

    expect(flowService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "flow-1" },
      { name: "Renamed" },
    )
  })
})

describe("DELETE /v1/flows/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/flows/{id}")

  test("delegates to flowService.deleteMany", async () => {
    flowService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "flow-1" },
    })

    expect(flowService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["flow-1"],
    })
  })
})

describe("POST /v1/flows/{id}/duplicate", () => {
  const procedure = findProcedure("POST", "/v1/flows/{id}/duplicate")

  test("delegates to flowService.duplicate", async () => {
    flowService.duplicate.mockResolvedValueOnce("flow-2")

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "flow-1" },
      }),
    ).resolves.toEqual({ id: "flow-2" })

    expect(flowService.duplicate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "flow-1",
    })
  })
})

describe("POST /v1/flows/{id}/publish", () => {
  const procedure = findProcedure("POST", "/v1/flows/{id}/publish")

  test("delegates to flowVersionService.publish", async () => {
    flowVersionService.publish.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "flow-1", nodes: [], edges: [] },
    })

    expect(flowVersionService.publish).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      flowId: "flow-1",
      nodes: [],
      edges: [],
    })
  })

  test("compiles a { spec } input into nodes/edges before publishing", async () => {
    flowVersionService.publish.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        id: "flow-1",
        spec: {
          formatVersion: 1,
          name: "Spec flow",
          steps: [{ type: "send", text: "Hello!" }],
        },
      },
    })

    expect(getFlowAuthoringContext).toHaveBeenCalledWith("workspace-1")
    expect(flowVersionService.publish).toHaveBeenCalledTimes(1)
    const call = flowVersionService.publish.mock.calls[0][0]
    expect(call.workspaceId).toBe("workspace-1")
    expect(call.flowId).toBe("flow-1")
    expect(call.nodes).toHaveLength(1)
    expect(call.nodes[0].type).toBe("sendMessage")
    expect(call.edges).toEqual([])
  })

  test("throws FlowAuthoringException (not a raw 500) when the compiled spec fails channel refinement", async () => {
    const input = {
      id: "flow-1",
      spec: {
        formatVersion: 1,
        name: "Spec flow",
        channel: "instagram",
        steps: [
          {
            type: "send",
            imageUrl: "https://example.com/a.png",
            buttons: [{ text: "Yes" }],
          },
        ],
      },
    }

    let caught: unknown
    try {
      await procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(FlowAuthoringException)
    expect((caught as FlowAuthoringException).errors[0]?.path).toMatch(
      SPEC_STEP_PATH_PATTERN,
    )
    expect(flowVersionService.publish).not.toHaveBeenCalled()
  })
})

describe("POST /v1/flows/validate", () => {
  const procedure = findProcedure("POST", "/v1/flows/validate")

  test("compiles a spec and returns the graph without persisting anything", async () => {
    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        spec: {
          formatVersion: 1,
          name: "Spec flow",
          steps: [{ type: "send", text: "Hello!" }],
        },
      },
    })

    expect(getFlowAuthoringContext).toHaveBeenCalledWith("workspace-1")
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].type).toBe("sendMessage")
    expect(result.edges).toEqual([])
    expect(flowVersionService.publish).not.toHaveBeenCalled()
    expect(flowVersionService.updateDraftByFlowId).not.toHaveBeenCalled()
  })

  test("throws FlowAuthoringException for an unknown template name", async () => {
    let caught: unknown
    try {
      await procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: {
          spec: {
            formatVersion: 1,
            name: "Spec flow",
            steps: [{ type: "sendTemplate", templateName: "does_not_exist" }],
          },
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(FlowAuthoringException)
    expect((caught as FlowAuthoringException).errors[0]?.code).toBe(
      "unknownTemplate",
    )
  })
})

describe("PUT /v1/flows/{id}/draft", () => {
  const procedure = findProcedure("PUT", "/v1/flows/{id}/draft")

  test("delegates to flowVersionService.updateDraftByFlowId", async () => {
    flowVersionService.updateDraftByFlowId.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "flow-1", nodes: [], edges: [] },
    })

    expect(flowVersionService.updateDraftByFlowId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      flowId: "flow-1",
      nodes: [],
      edges: [],
    })
  })

  test("compiles a { spec } input into nodes/edges before updating the draft", async () => {
    flowVersionService.updateDraftByFlowId.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        id: "flow-1",
        spec: {
          formatVersion: 1,
          name: "Spec flow",
          steps: [{ type: "send", text: "Hello!" }],
        },
      },
    })

    expect(getFlowAuthoringContext).toHaveBeenCalledWith("workspace-1")
    expect(flowVersionService.updateDraftByFlowId).toHaveBeenCalledTimes(1)
    const call = flowVersionService.updateDraftByFlowId.mock.calls[0][0]
    expect(call.workspaceId).toBe("workspace-1")
    expect(call.flowId).toBe("flow-1")
    expect(call.nodes).toHaveLength(1)
    expect(call.nodes[0].type).toBe("sendMessage")
    expect(call.edges).toEqual([])
  })
})

describe("GET /v1/flows/{id}/versions", () => {
  const procedure = findProcedure("GET", "/v1/flows/{id}/versions")

  test("delegates to flowVersionService.list", async () => {
    flowVersionService.list.mockResolvedValueOnce([{ id: "version-1" }])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "flow-1" },
      }),
    ).resolves.toEqual({ data: [{ id: "version-1" }] })

    expect(flowVersionService.list).toHaveBeenCalledWith({
      flowId: "flow-1",
      workspaceId: "workspace-1",
    })
  })
})

describe("publishFlowRequest / updateDraftFlowRequest — mixed body rejection", () => {
  const validSpec = {
    formatVersion: 1,
    name: "Spec flow",
    steps: [{ type: "send", text: "Hello!" }],
  }

  test("publishFlowRequest rejects a body carrying both nodes/edges and spec", async () => {
    const { publishFlowRequest } = await import(
      "@/features/flows/schema/action"
    )

    const result = publishFlowRequest.safeParse({
      nodes: [],
      edges: [],
      spec: validSpec,
    })

    expect(result.success).toBe(false)
  })

  test("publishFlowRequest still accepts a spec-only body", async () => {
    const { publishFlowRequest } = await import(
      "@/features/flows/schema/action"
    )

    const result = publishFlowRequest.safeParse({ spec: validSpec })

    expect(result.success).toBe(true)
    expect(result.success && "spec" in result.data).toBe(true)
  })

  test("publishFlowRequest still accepts a graph-only body", async () => {
    const { publishFlowRequest } = await import(
      "@/features/flows/schema/action"
    )

    const result = publishFlowRequest.safeParse({ nodes: [], edges: [] })

    expect(result.success).toBe(true)
    expect(result.success && "spec" in result.data).toBe(false)
  })

  test("updateDraftFlowRequest rejects a body carrying both nodes/edges and spec", async () => {
    const { updateDraftFlowRequest } = await import(
      "@/features/flows/schema/action"
    )

    const result = updateDraftFlowRequest.safeParse({
      nodes: [],
      edges: [],
      spec: validSpec,
    })

    expect(result.success).toBe(false)
  })

  test("updateDraftFlowRequest still accepts a spec-only body", async () => {
    const { updateDraftFlowRequest } = await import(
      "@/features/flows/schema/action"
    )

    const result = updateDraftFlowRequest.safeParse({ spec: validSpec })

    expect(result.success).toBe(true)
    expect(result.success && "spec" in result.data).toBe(true)
  })

  test("updateDraftFlowRequest still accepts a graph-only body", async () => {
    const { updateDraftFlowRequest } = await import(
      "@/features/flows/schema/action"
    )

    const result = updateDraftFlowRequest.safeParse({ nodes: [], edges: [] })

    expect(result.success).toBe(true)
    expect(result.success && "spec" in result.data).toBe(false)
  })

  // The actual route input is `publishFlowRequest.and(publicIdParam(...))` —
  // a plain `.strict()` union member rejects the intersection's `id` key
  // before the two schemas ever merge, which would break every real
  // request. Pin the composed shape directly so a future refactor can't
  // silently reintroduce that regression.
  test("publishFlowRequest composed with the route's id param still accepts spec-only and graph-only bodies", async () => {
    const { publishFlowRequest } = await import(
      "@/features/flows/schema/action"
    )
    const { publicIdParam } = await import("@/lib/public-api/params")

    const composed = publishFlowRequest.and(publicIdParam("flow", "flows.list"))

    expect(composed.safeParse({ id: "1", spec: validSpec }).success).toBe(true)
    expect(composed.safeParse({ id: "1", nodes: [], edges: [] }).success).toBe(
      true,
    )
    expect(
      composed.safeParse({ id: "1", nodes: [], edges: [], spec: validSpec })
        .success,
    ).toBe(false)
  })
})

describe("POST /v1/flows/import", () => {
  const procedure = findProcedure("POST", "/v1/flows/import")

  test("delegates to importService.startFlowImport with a null userId and queues the import job", async () => {
    importService.startFlowImport.mockResolvedValueOnce({
      ok: true,
      importId: "import-1",
    })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1", ownerId: "user-1" } },
        input: { fileId: "file-1", folderId: null },
      }),
    ).resolves.toEqual({ importId: "import-1" })

    // `userId: null` — matches the contacts public-API precedent so a
    // token-initiated import is never mis-attributed to the workspace owner.
    expect(importService.startFlowImport).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: null,
      fileId: "file-1",
      folderId: null,
    })
    expect(defaultQueue.add).toHaveBeenCalledWith("runImport", {
      type: "runImport",
      data: { importId: "import-1" },
    })
  })

  test("throws a validation exception when the file is not found", async () => {
    importService.startFlowImport.mockResolvedValueOnce({
      ok: false,
      reason: "fileNotFound",
    })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1", ownerId: "user-1" } },
        input: { fileId: "file-1", folderId: null },
      }),
    ).rejects.toThrow("File not found")

    expect(defaultQueue.add).not.toHaveBeenCalled()
  })
})
