import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureInvocation = {
  context: { workspace: { id: string } }
  input: Record<string, unknown>
}

type ProcedureHandler = (args: ProcedureInvocation) => unknown

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

const emailTopicService = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ emailTopicService }))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    emailTopicModel: {},
  }
})

await import("@/features/email-topics/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
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

test("registers the email topics public router under the broadcasts scope", () => {
  expect(scopeArgAtImport).toBe("broadcasts")
})

test("registers the expected public CRUD routes", () => {
  expect(capturedProcedures.map((procedure) => procedure.route)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ method: "GET", path: "/v1/email-topics" }),
      expect.objectContaining({ method: "POST", path: "/v1/email-topics" }),
      expect.objectContaining({
        method: "PUT",
        path: "/v1/email-topics/{id}",
      }),
      expect.objectContaining({
        method: "DELETE",
        path: "/v1/email-topics/{id}",
      }),
    ]),
  )
})

describe("GET /v1/email-topics", () => {
  const procedure = findProcedure("GET", "/v1/email-topics")

  test("lists email topics in the token workspace", async () => {
    const response = { data: [{ id: "topic-1", name: "News" }], pageCount: 1 }
    emailTopicService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 2, perPage: 10, name: "News", folderId: "folder-1" },
      }),
    ).resolves.toEqual(response)

    expect(emailTopicService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 10,
      name: "News",
      folderId: "folder-1",
    })
  })
})

describe("POST /v1/email-topics", () => {
  const procedure = findProcedure("POST", "/v1/email-topics")

  test("creates an email topic in the token workspace", async () => {
    emailTopicService.create.mockResolvedValueOnce({ id: "topic-1" })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { name: "News", folderId: "folder-1" },
      }),
    ).resolves.toEqual({ id: "topic-1" })

    expect(emailTopicService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "News", folderId: "folder-1" },
    })
  })
})

describe("PUT /v1/email-topics/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/email-topics/{id}")

  test("updates an email topic in the token workspace", async () => {
    const updatedTopic = { id: "topic-1", name: "Updates" }
    emailTopicService.update.mockResolvedValueOnce(updatedTopic)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "topic-1", name: "Updates" },
      }),
    ).resolves.toEqual(updatedTopic)

    expect(emailTopicService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "topic-1",
      data: { name: "Updates" },
    })
  })

  test("propagates a not-found error from the service", async () => {
    emailTopicService.update.mockRejectedValueOnce(new Error("Topic not found"))

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing", name: "Updates" },
      }),
    ).rejects.toThrow("Topic not found")
  })
})

describe("DELETE /v1/email-topics/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/email-topics/{id}")

  test("deletes an email topic in the token workspace", async () => {
    emailTopicService.delete.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "topic-1" },
      }),
    ).resolves.toBeUndefined()

    expect(emailTopicService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["topic-1"],
    })
  })
})
