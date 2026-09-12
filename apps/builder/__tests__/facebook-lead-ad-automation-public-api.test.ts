import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type CapturedHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: CapturedHandler
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
      handler: vi.fn((fn: CapturedHandler) => {
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

const facebookLeadAdsAutomationService = {
  list: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ facebookLeadAdsAutomationService }))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("@/features/facebook-lead-ad-automation/schema/public", () => ({
  listFacebookLeadAdsPublicRequest: {},
  listFacebookLeadAdsPublicResponse: {},
  getFacebookLeadAdPublicRequest: {},
  createFacebookLeadAdPublicRequest: {},
  updateFacebookLeadAdPublicRequest: {},
  deleteFacebookLeadAdPublicRequest: {},
  facebookLeadAdPublicDetailResource: {},
  facebookLeadAdPublicResource: {},
}))

await import("@/features/facebook-lead-ad-automation/api/public")

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
const workspaceContext = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the Facebook Lead Ads public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/facebook-lead-ads", () => {
  const procedure = findProcedure("GET", "/v1/facebook-lead-ads")

  test("lists automations scoped to the token workspace", async () => {
    const response = { data: [{ id: "lead-ad-1" }], pageCount: 1 }
    facebookLeadAdsAutomationService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { page: 2, perPage: 25, keyword: "newsletter" },
      }),
    ).resolves.toEqual(response)

    expect(facebookLeadAdsAutomationService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 25,
      keyword: "newsletter",
    })
  })
})

describe("GET /v1/facebook-lead-ads/{id}", () => {
  const procedure = findProcedure("GET", "/v1/facebook-lead-ads/{id}")

  test("gets an automation scoped to the token workspace", async () => {
    const automation = { id: "lead-ad-1", flow: null }
    facebookLeadAdsAutomationService.findById.mockResolvedValueOnce(automation)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { id: "lead-ad-1" },
      }),
    ).resolves.toEqual(automation)

    expect(facebookLeadAdsAutomationService.findById).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "lead-ad-1",
    })
  })

  test("declares a not-found error when the automation is absent", async () => {
    facebookLeadAdsAutomationService.findById.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { id: "missing" },
      }),
    ).rejects.toThrow("Facebook Lead Ads automation not found")
  })
})

describe("POST /v1/facebook-lead-ads", () => {
  const procedure = findProcedure("POST", "/v1/facebook-lead-ads")

  test("creates an automation without a session actor", async () => {
    const automation = { id: "lead-ad-1" }
    facebookLeadAdsAutomationService.create.mockResolvedValueOnce(automation)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: {
          name: "Newsletter leads",
          pageId: "page-1",
          formId: "form-1",
          fieldMapping: [],
        },
      }),
    ).resolves.toEqual(automation)

    expect(facebookLeadAdsAutomationService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Newsletter leads",
      pageId: "page-1",
      pageName: null,
      formId: "form-1",
      formName: null,
      fieldMapping: [],
      flowId: null,
    })
  })
})

describe("PUT /v1/facebook-lead-ads/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/facebook-lead-ads/{id}")

  test("updates an automation through the shared service", async () => {
    const automation = { id: "lead-ad-1", name: "Renamed" }
    facebookLeadAdsAutomationService.update.mockResolvedValueOnce(automation)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { id: "lead-ad-1", name: "Renamed", flowId: null },
      }),
    ).resolves.toEqual(automation)

    expect(facebookLeadAdsAutomationService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "lead-ad-1" },
      { name: "Renamed", flowId: null },
    )
  })

  test("declares a not-found error when the automation is absent", async () => {
    facebookLeadAdsAutomationService.update.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { id: "missing", name: "Renamed" },
      }),
    ).rejects.toThrow("Facebook Lead Ads automation not found")
  })
})

describe("DELETE /v1/facebook-lead-ads/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/facebook-lead-ads/{id}")

  test("deletes one automation through the shared bulk-delete service", async () => {
    facebookLeadAdsAutomationService.deleteMany.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { id: "lead-ad-1" },
      }),
    ).resolves.toBeUndefined()

    expect(facebookLeadAdsAutomationService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["lead-ad-1"],
    })
  })
})
