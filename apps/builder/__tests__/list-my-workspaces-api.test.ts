import { beforeEach, describe, expect, test, vi } from "vitest"
import z from "zod"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type CapturedProcedure = {
  route: RouteConfig
  outputSchema?: z.ZodTypeAny
  handler?: (...args: any[]) => any
}

const { authorizedAPI, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn((schema: z.ZodTypeAny) => {
        record.outputSchema = schema
        return chain
      }),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  return {
    authorizedAPI: {
      route: vi.fn((config: RouteConfig) => makeProcedure(config)),
    },
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ authorizedAPI }))

const listByUserId = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  workspaceMemberService: { listByUserId },
}))

// A minimal stand-in for `createSelectSchema(workspaceModel)` — a real zod
// object schema (not just `{}`) so the output schema is genuinely parsed
// below. The model carries no secrets: workspace API tokens live hashed in
// WorkspaceApiToken, never as a Workspace column.
vi.mock("@chatbotx.io/database/schema", () => ({
  createSelectSchema: () =>
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  workspaceModel: {},
}))

await import("@/features/workspaces/api/private")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /users/me/workspaces", () => {
  const procedure = findProcedure("GET", "/users/me/workspaces")

  test("output schema passes model fields through and drops unknown keys", () => {
    const parsed = procedure.outputSchema?.parse({
      workspaces: [{ id: "ws-1", name: "Acme", extraneous: "x" }],
    }) as { workspaces: Record<string, unknown>[] }

    expect(parsed.workspaces[0]).toEqual({ id: "ws-1", name: "Acme" })
    expect(Object.keys(parsed.workspaces[0]).sort()).toEqual(["id", "name"])
  })

  test("delegates to workspaceMemberService.listByUserId and unwraps member.workspace", async () => {
    listByUserId.mockResolvedValueOnce([
      { workspace: { id: "ws-1", name: "Acme" } },
    ])

    const result = await procedure.handler?.({
      context: { user: { id: "user-1" } },
    })

    expect(listByUserId).toHaveBeenCalledWith({ userId: "user-1" })
    expect(result).toEqual({
      workspaces: [{ id: "ws-1", name: "Acme" }],
    })
  })
})
