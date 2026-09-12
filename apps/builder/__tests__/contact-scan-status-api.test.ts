import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type StatusInput = { workspaceId: string; inboxId: string }
type WorkspaceMapper = (input: StatusInput) => string
type ProcedureHandler = (args: { input: StatusInput }) => Promise<unknown>

const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const state: {
      handler?: ProcedureHandler
      middleware?: unknown
      routeConfig?: RouteConfig
      workspaceMapper?: WorkspaceMapper
    } = {}

    const procedure = {
      route: vi.fn((config: RouteConfig) => {
        state.routeConfig = config
        return procedure
      }),
      input: vi.fn((_schema: unknown) => procedure),
      output: vi.fn((_schema: unknown) => procedure),
      use: vi.fn((middleware: unknown, mapper: WorkspaceMapper) => {
        state.middleware = middleware
        state.workspaceMapper = mapper
        return procedure
      }),
      handler: vi.fn((handler: ProcedureHandler) => {
        state.handler = handler
        return { handler }
      }),
    }

    return {
      authorizedAPI: procedure,
      mocks: {
        requireUnrestrictedContactsScope: vi.fn(),
        getContactScanStatus: vi.fn(),
        state,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({ authorizedAPI }))

vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))

vi.mock(
  "@/features/contact-scan/lib/require-unrestricted-contacts-scope",
  () => ({
    requireUnrestrictedContactsScope: mocks.requireUnrestrictedContactsScope,
  }),
)

vi.mock("@/features/contact-scan/lib/get-contact-scan-status", () => ({
  getContactScanStatus: mocks.getContactScanStatus,
}))

const { contactScanAuthenticatedAPI } = await import(
  "@/features/contact-scan/api/private"
)

describe("getContactScanStatusAuthenticatedAPI", () => {
  beforeEach(() => {
    mocks.requireUnrestrictedContactsScope.mockReset()
    mocks.getContactScanStatus.mockReset()
  })

  test("registers an authenticated workspace-scoped GET endpoint", () => {
    expect(contactScanAuthenticatedAPI).toHaveProperty(
      "getContactScanStatusAuthenticatedAPI",
    )
    expect(mocks.state.routeConfig).toEqual({
      method: "GET",
      path: "/workspaces/{workspaceId}/contact-scans/status",
      summary: "Get the latest Automatic Customer Scan status for an inbox",
      tags: ["Contacts"],
    })
    expect(mocks.state.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(
      mocks.state.workspaceMapper?.({
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
      }),
    ).toBe("workspace-1")
    expect(mocks.state.handler).toBeDefined()
  })

  test("gates on requireUnrestrictedContactsScope before reading status", async () => {
    mocks.requireUnrestrictedContactsScope.mockResolvedValueOnce({
      canViewEmailAndPhone: true,
    })
    mocks.getContactScanStatus.mockResolvedValueOnce({
      status: "idle",
      latest: null,
      availability: { canScan: true },
    })

    const result = await mocks.state.handler?.({
      input: { workspaceId: "workspace-1", inboxId: "inbox-1" },
    })

    expect(mocks.requireUnrestrictedContactsScope).toHaveBeenCalledWith(
      "workspace-1",
    )
    expect(mocks.getContactScanStatus).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
    })
    expect(result).toEqual({
      status: "idle",
      latest: null,
      availability: { canScan: true },
    })
  })

  test("propagates contactScanForbidden for a restricted member without calling getContactScanStatus", async () => {
    const forbidden = new Error("contactScanForbidden")
    mocks.requireUnrestrictedContactsScope.mockRejectedValueOnce(forbidden)

    await expect(
      mocks.state.handler?.({
        input: { workspaceId: "workspace-1", inboxId: "inbox-1" },
      }),
    ).rejects.toThrow(forbidden)

    expect(mocks.getContactScanStatus).not.toHaveBeenCalled()
  })
})
