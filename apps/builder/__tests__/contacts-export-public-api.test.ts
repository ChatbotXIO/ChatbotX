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

const startExport = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactExportService: { start: startExport },
}))

await import("@/features/contacts/api/public/export")

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

describe("POST /v1/contacts/export", () => {
  const procedure = findProcedure("POST", "/v1/contacts/export")

  test("route metadata declares a 202 (async job)", () => {
    expect(procedure.route).toEqual(
      expect.objectContaining({ successStatus: 202 }),
    )
  })

  test("starts the export with a null requestedUserId and full PII visibility", async () => {
    startExport.mockResolvedValueOnce({ fileId: "file-1" })

    const input = { fields: ["sys:firstName"], exportAll: true }
    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input,
      }),
    ).resolves.toEqual({ fileId: "file-1" })

    expect(startExport).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      requestedUserId: null,
      canExportEmailAndPhone: true,
      ...input,
    })
  })
})
