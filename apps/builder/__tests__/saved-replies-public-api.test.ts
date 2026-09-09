import { beforeEach, describe, expect, test, vi } from "vitest"

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

const savedReplyService = {
  findByIdOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ savedReplyService }))

const listSavedReplies = vi.fn()
vi.mock("../src/features/saved-replies/queries", () => ({
  listSavedReplies,
}))

await import("@/features/saved-replies/api/public")

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
const context = { workspace: { id: "ws-1", ownerId: "owner-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the saved-replies public router under the inbox scope", () => {
  expect(scopeArgAtImport).toBe("inbox")
})

describe("GET /v1/saved-replies/{id}", () => {
  const procedure = findProcedure("GET", "/v1/saved-replies/{id}")

  test("delegates to savedReplyService.findByIdOrFail", async () => {
    savedReplyService.findByIdOrFail.mockResolvedValueOnce({ id: "1" })

    const result = await procedure.handler?.({ context, input: { id: "1" } })

    expect(savedReplyService.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "1",
    })
    expect(result).toEqual({ id: "1" })
  })
})

describe("POST /v1/saved-replies", () => {
  const procedure = findProcedure("POST", "/v1/saved-replies")

  test("delegates to savedReplyService.create", async () => {
    savedReplyService.create.mockResolvedValueOnce({ id: "1" })

    const result = await procedure.handler?.({
      context,
      input: { shortcut: "/hi", text: "Hello!" },
    })

    expect(savedReplyService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      shortcut: "/hi",
      text: "Hello!",
    })
    expect(result).toEqual({ id: "1" })
  })
})

describe("PUT /v1/saved-replies/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/saved-replies/{id}")

  test("delegates to savedReplyService.update", async () => {
    savedReplyService.update.mockResolvedValueOnce({ id: "1" })

    const result = await procedure.handler?.({
      context,
      input: { id: "1", shortcut: "/hi", text: "Updated" },
    })

    expect(savedReplyService.update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "1" },
      { shortcut: "/hi", text: "Updated" },
    )
    expect(result).toEqual({ id: "1" })
  })
})

describe("DELETE /v1/saved-replies/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/saved-replies/{id}")

  test("delegates to savedReplyService.delete", async () => {
    await procedure.handler?.({ context, input: { id: "1" } })

    expect(savedReplyService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "1",
    })
  })
})
