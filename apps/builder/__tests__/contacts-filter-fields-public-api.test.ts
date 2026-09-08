// @vitest-environment node

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

const listContactFilterFieldsForAPI = vi.fn()
vi.mock(
  "../src/features/contact-filter/queries/list-contact-filter-fields",
  () => ({
    listContactFilterFieldsForAPI,
  }),
)

await import("@/features/contact-filter/api/public")

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

describe("GET /v1/contacts/filter-fields", () => {
  const procedure = findProcedure("GET", "/v1/contacts/filter-fields")

  test("delegates to listContactFilterFieldsForAPI scoped to the workspace", async () => {
    const response = {
      staticFields: [],
      customFields: [],
      botFields: [],
      tags: [],
    }
    listContactFilterFieldsForAPI.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
      }),
    ).resolves.toEqual(response)

    expect(listContactFilterFieldsForAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })
})
