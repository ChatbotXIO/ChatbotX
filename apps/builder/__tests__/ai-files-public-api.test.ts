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
}
vi.mock("@chatbotx.io/business", () => ({
  aiFileService,
  AI_FILE_MAX_UPLOAD_BYTES: 100 * 1000 * 1000,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
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
  })

  test("delegates to aiFileService.create with a source url", async () => {
    aiFileService.create.mockResolvedValueOnce({ id: "file-2" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { url: "https://example.com/manual.pdf" },
    })

    expect(aiFileService.create).toHaveBeenCalledWith("workspace-1", {
      url: "https://example.com/manual.pdf",
    })
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
