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
// object schema (not just `{}`) is required so `getWorkspacePublicResource`'s
// `.omit({ token: true })` genuinely strips the field when the output schema
// is parsed below, instead of just asserting on mock call args.
vi.mock("@chatbotx.io/database/schema", () => ({
  createSelectSchema: () =>
    z.object({
      id: z.string(),
      name: z.string(),
      token: z.string(),
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

  test("output schema strips the workspace token", () => {
    const rawWorkspace = { id: "ws-1", name: "Acme", token: "super-secret" }

    const parsed = procedure.outputSchema?.parse({
      workspaces: [rawWorkspace],
    }) as { workspaces: Record<string, unknown>[] }

    expect(parsed.workspaces[0]).toEqual({ id: "ws-1", name: "Acme" })
    expect(Object.keys(parsed.workspaces[0]).sort()).toEqual(["id", "name"])
    expect(parsed.workspaces[0]).not.toHaveProperty("token")
  })

  test("delegates to workspaceMemberService.listByUserId and unwraps member.workspace", async () => {
    listByUserId.mockResolvedValueOnce([
      { workspace: { id: "ws-1", name: "Acme", token: "super-secret" } },
    ])

    const result = await procedure.handler?.({
      context: { user: { id: "user-1" } },
    })

    expect(listByUserId).toHaveBeenCalledWith({ userId: "user-1" })
    expect(result).toEqual({
      workspaces: [{ id: "ws-1", name: "Acme", token: "super-secret" }],
    })
  })
})
