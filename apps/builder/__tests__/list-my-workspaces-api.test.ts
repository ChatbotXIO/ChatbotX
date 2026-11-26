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

const hostTenant = vi.hoisted(() => ({ value: "tenant-a" }))
vi.mock("@/lib/tenant/request-tenant", () => ({
  resolveRequestTenantId: async () => hostTenant.value,
  filterWorkspacesForHost: <T extends { tenantId: string }>(
    items: T[],
    host: string,
  ) => items.filter((item) => item.tenantId === host),
}))

const listByUserId = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  workspaceMemberService: { listByUserId },
}))

// A minimal stand-in for `createSelectSchema(workspaceModel)` — a real zod
// object schema (not just `{}`) so the output schema is genuinely parsed
// below. Includes `token` (the deprecated, read-only legacy plaintext
// {{api_key}} source) so this suite can prove `workspaceResource`'s
// `.omit({ token: true })` actually strips it before it ever reaches this
// public API response.
vi.mock("@chatbotx.io/database/schema", () => ({
  createSelectSchema: () =>
    z.object({
      id: z.string(),
      name: z.string(),
      token: z.string().nullable(),
    }),
  workspaceDeletionRecordDetailsSchema: z.object({}),
  workspaceDeletionRecordUsageSnapshotSchema: z.object({}),
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

  test("output schema strips the deprecated Workspace.token column", () => {
    const parsed = procedure.outputSchema?.parse({
      workspaces: [
        { id: "ws-1", name: "Acme", token: "legacy-plaintext-token" },
      ],
    }) as { workspaces: Record<string, unknown>[] }

    expect(parsed.workspaces[0]).not.toHaveProperty("token")
    expect(JSON.stringify(parsed)).not.toContain("legacy-plaintext-token")
  })

  test("delegates to workspaceMemberService.listByUserId and unwraps member.workspace", async () => {
    listByUserId.mockResolvedValueOnce([
      { workspace: { id: "ws-1", name: "Acme", tenantId: "tenant-a" } },
    ])

    const result = await procedure.handler?.({
      context: { user: { id: "user-1" } },
    })

    expect(listByUserId).toHaveBeenCalledWith({ userId: "user-1" })
    expect(result).toEqual({
      workspaces: [{ id: "ws-1", name: "Acme", tenantId: "tenant-a" }],
    })
  })

  test("lists only the workspaces of the request host's tenant", async () => {
    listByUserId.mockResolvedValueOnce([
      { workspace: { id: "ws-root", name: "Root", tenantId: "root" } },
      { workspace: { id: "ws-a", name: "A", tenantId: "tenant-a" } },
    ])

    const result = await procedure.handler?.({
      context: { user: { id: "user-1" } },
    })

    expect(result.workspaces.map((w: { id: string }) => w.id)).toEqual(["ws-a"])
  })
})
