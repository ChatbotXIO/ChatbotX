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

const getExportFileForAPI = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactExportService: { getFile: getExportFileForAPI },
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

describe("GET /v1/contacts/export-files/{fileId}", () => {
  const procedure = findProcedure("GET", "/v1/contacts/export-files/{fileId}")

  test("scopes the lookup by workspace id, no session user", async () => {
    getExportFileForAPI.mockResolvedValueOnce({
      status: "uploaded",
      fileName: "contacts-2026-01-01.csv",
      downloadUrl: "https://example.com/signed",
      totalRecords: 42,
    })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { fileId: "file-1" },
      }),
    ).resolves.toEqual({
      status: "uploaded",
      fileName: "contacts-2026-01-01.csv",
      downloadUrl: "https://example.com/signed",
      totalRecords: 42,
    })

    expect(getExportFileForAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      fileId: "file-1",
    })
  })
})
