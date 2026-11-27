import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
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
      handler: vi.fn((fn: ProcedureHandler) => {
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

const aiFileService = {
  listAIFiles: vi.fn(),
  findWithProcessing: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  listChunks: vi.fn(),
  reindex: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  aiFileService,
  AI_FILE_MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  BROADCAST_PLAN_LIMIT_CODE: "broadcastPlanLimit",
  ChatbotXException: class extends Error {},
  notFoundException: (message: string) => new Error(message),
}))

const searchAIFiles = vi.fn()
vi.mock("@chatbotx.io/ai/server", () => ({ searchAIFiles }))
const assertAIFileCreateFromUrlNotRateLimited = vi.fn()
vi.mock("@/features/ai-files/lib/rate-limit", () => ({
  assertAIFileCreateFromUrlNotRateLimited,
  assertAIFileReindexNotRateLimited: vi.fn(),
  assertAIFileSearchNotRateLimited: vi.fn(),
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
    aiFileModel: {},
  }
})

// Deferred until after `vi.mock` calls above are hoisted, so the router
// module picks up the mocked `@/orpc`/`@chatbotx.io/business` bindings.
await import("@/features/ai-files/api/public")
const { createAIFilePublicRequest } = await import(
  "@/features/ai-files/schema/public"
)

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

test("registers the ai-files public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/ai-files", () => {
  const procedure = findProcedure("GET", "/v1/ai-files")

  test("delegates to aiFileService.listAIFiles", async () => {
    aiFileService.listAIFiles.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(aiFileService.listAIFiles).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/ai-files/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ai-files/{id}")

  test("delegates to aiFileService.findWithProcessing", async () => {
    aiFileService.findWithProcessing.mockResolvedValueOnce({ id: "file-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "file-1" },
    })

    expect(aiFileService.findWithProcessing).toHaveBeenCalledWith({
      where: { id: "file-1", workspaceId: "workspace-1" },
    })
  })

  test("throws not found when the file does not exist", async () => {
    aiFileService.findWithProcessing.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("AI file not found")
  })
})

describe("POST /v1/ai-files", () => {
  const procedure = findProcedure("POST", "/v1/ai-files")

  test("delegates to aiFileService.create with a file upload", async () => {
    const file = new File(["hello"], "manual.pdf", {
      type: "application/pdf",
    })
    aiFileService.create.mockResolvedValueOnce({ id: "file-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { file },
    })

    expect(aiFileService.create).toHaveBeenCalledWith("workspace-1", {
      file,
    })
    expect(assertAIFileCreateFromUrlNotRateLimited).not.toHaveBeenCalled()
  })

  test("delegates to aiFileService.create with a source url", async () => {
    aiFileService.create.mockResolvedValueOnce({ id: "file-2" })

    const resHeaders = new Headers()

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" }, resHeaders },
      input: { url: "https://example.com/manual.pdf" },
    })

    expect(assertAIFileCreateFromUrlNotRateLimited).toHaveBeenCalledWith(
      "workspace-1",
      resHeaders,
    )
    expect(aiFileService.create).toHaveBeenCalledWith("workspace-1", {
      url: "https://example.com/manual.pdf",
    })
  })

  test("a rate-limited url never reaches the service", async () => {
    const limited = Object.assign(new Error("Too many requests"), {
      code: "tooManyRequests",
    })
    assertAIFileCreateFromUrlNotRateLimited.mockRejectedValueOnce(limited)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { url: "https://example.com/manual.pdf" },
      }),
    ).rejects.toBe(limited)
    expect(aiFileService.create).not.toHaveBeenCalled()
  })

  test("documents the 25 MB limit instead of 100MB", () => {
    const route = procedure.route as RouteConfig & { description?: string }
    expect(route.description).toContain("25 MB")
    expect(route.description).not.toContain("100MB")
  })
})

describe("createAIFilePublicRequest", () => {
  const file = new File(["hello"], "manual.pdf", { type: "application/pdf" })

  test("accepts file only", () => {
    expect(createAIFilePublicRequest.safeParse({ file }).success).toBe(true)
  })

  test("accepts url only", () => {
    expect(
      createAIFilePublicRequest.safeParse({
        url: "https://example.com/manual.pdf",
      }).success,
    ).toBe(true)
  })

  test("rejects a payload carrying both file and url instead of silently dropping one", () => {
    const result = createAIFilePublicRequest.safeParse({
      file,
      url: "https://example.com/manual.pdf",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Provide either 'file' or 'url', not both.",
      )
    }
  })

  test("rejects a file over 25 MB", () => {
    const big = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "big.pdf")
    const result = createAIFilePublicRequest.safeParse({ file: big })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Max file size is 25 MB.")
    }
  })

  test("rejects a payload with neither file nor url", () => {
    const result = createAIFilePublicRequest.safeParse({
      name: "manual.pdf",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Provide either 'file' or 'url'.",
      )
    }
  })
})

describe("DELETE /v1/ai-files/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ai-files/{id}")

  test("delegates to aiFileService.delete", async () => {
    aiFileService.delete.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "file-1" },
    })

    expect(aiFileService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "file-1",
    })
  })
})

describe("phase-two AI file procedures", () => {
  test("registers search, chunks, and reindex procedures", () => {
    expect(findProcedure("POST", "/v1/ai-files/search").route.summary).toBe(
      "Search AI file chunks",
    )
    expect(findProcedure("GET", "/v1/ai-files/{id}/chunks").route.summary).toBe(
      "List AI file chunks",
    )
    expect(
      findProcedure("POST", "/v1/ai-files/{id}/reindex").route.successStatus,
    ).toBe(202)
  })

  test("search delegates to the shared retrieval implementation", async () => {
    searchAIFiles.mockResolvedValueOnce({ results: [] })
    const procedure = findProcedure("POST", "/v1/ai-files/search")

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" }, resHeaders: new Headers() },
      input: { query: "hello", fileIds: ["1"] },
    })

    expect(searchAIFiles).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      query: "hello",
      fileIds: ["1"],
    })
  })

  test("list chunks and reindex use workspace-scoped service methods", async () => {
    aiFileService.listChunks.mockResolvedValueOnce({
      data: [],
      nextCursor: null,
    })
    aiFileService.reindex.mockResolvedValueOnce({
      file: { id: "1" },
      coalesced: true,
    })

    await findProcedure("GET", "/v1/ai-files/{id}/chunks").handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "1", limit: 50 },
    })
    await findProcedure("POST", "/v1/ai-files/{id}/reindex").handler?.({
      context: { workspace: { id: "workspace-1" }, resHeaders: new Headers() },
      input: { id: "1" },
    })

    expect(aiFileService.listChunks).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      aiFileId: "1",
      id: "1",
      limit: 50,
    })
    expect(aiFileService.reindex).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "1",
    })
  })
})
