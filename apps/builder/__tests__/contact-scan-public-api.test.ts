import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type PublicProcedureInput = {
  context: { workspace: { id: string } }
  input: { inboxId: string }
}

type ProcedureHandler = (args: PublicProcedureInput) => Promise<unknown>

type CapturedProcedure = {
  route: RouteConfig
  errors?: unknown
  handler?: ProcedureHandler
}

const {
  workspaceTokenAuthAPIForScope,
  capturedProcedures,
  possibleErrorsOnListingResource,
  getContactScanStatus,
} = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const possibleErrorsOnListingResource = {
    businessError: {
      message: "An error occurred while processing your request",
      status: 400,
    },
  }
  const getContactScanStatus = vi.fn()

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn((errors: unknown) => {
        record.errors = errors
        return chain
      }),
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
    possibleErrorsOnListingResource,
    getContactScanStatus,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnListingResource,
}))

vi.mock(
  "@/features/contact-scan/queries/get-contact-scan-status.query",
  () => ({
    getContactScanStatus,
  }),
)

await import("@/features/contact-scan/api/public")

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

test("registers the contact scan public router under the contacts scope", () => {
  expect(scopeArgAtImport).toBe("contacts")
})

describe("GET /v1/contact-scans/status", () => {
  const procedure = findProcedure("GET", "/v1/contact-scans/status")

  test("gets the status for the token workspace without a member permission gate", async () => {
    const result = {
      status: "idle",
      latest: null,
      availability: { canScan: true },
    }
    getContactScanStatus.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { inboxId: "inbox-1" },
      }),
    ).resolves.toEqual(result)

    expect(getContactScanStatus).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
    })
  })

  test("declares and propagates business errors from the shared status query", async () => {
    const error = new Error("Status lookup failed")
    getContactScanStatus.mockRejectedValueOnce(error)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { inboxId: "inbox-1" },
      }),
    ).rejects.toThrow("Status lookup failed")

    expect(procedure.errors).toBe(possibleErrorsOnListingResource)
  })
})
