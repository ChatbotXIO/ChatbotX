import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type PublicProcedureInput = {
  context: { workspace: { id: string } }
  input: Record<string, unknown>
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
  possibleErrorsOnSchedulingContactScan,
  getContactScanStatus,
  listContactScanHistoryRows,
  contactScanServiceSchedule,
} = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const possibleErrorsOnListingResource = {
    businessError: {
      message: "An error occurred while processing your request",
      status: 400,
    },
  }
  const possibleErrorsOnSchedulingContactScan = {
    businessError: {
      message: "An error occurred while processing your request",
      status: 400,
    },
    contactScanCooldown: {
      message:
        "This inbox was scanned recently. Please wait before scanning again.",
      status: 409,
    },
    contactScanAlreadyRunning: {
      message: "A scan is already running for this inbox.",
      status: 409,
    },
  }
  const getContactScanStatus = vi.fn()
  const listContactScanHistoryRows = vi.fn()
  const contactScanServiceSchedule = vi.fn()

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
    possibleErrorsOnSchedulingContactScan,
    getContactScanStatus,
    listContactScanHistoryRows,
    contactScanServiceSchedule,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnListingResource,
  possibleErrorsOnSchedulingContactScan,
}))

vi.mock("@/features/contact-scan/lib/get-contact-scan-status", () => ({
  getContactScanStatus,
}))

vi.mock("@/features/contact-scan/lib/contact-scan-history", () => ({
  listContactScanHistoryRows,
}))

vi.mock("@chatbotx.io/business", () => ({
  contactScanService: { schedule: contactScanServiceSchedule },
}))

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

describe("GET /v1/contact-scans", () => {
  const procedure = findProcedure("GET", "/v1/contact-scans")

  test("passes only workspaceId/page/perPage through, never a client-supplied workspaceId", async () => {
    const result = { data: [], pageCount: 1 }
    listContactScanHistoryRows.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 2, perPage: 25, workspaceId: "attacker-workspace" },
      }),
    ).resolves.toEqual(result)

    expect(listContactScanHistoryRows).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 25,
    })
  })

  test("declares business errors from the shared history query", () => {
    expect(procedure.errors).toBe(possibleErrorsOnListingResource)
  })
})

describe("POST /v1/contact-scans", () => {
  const procedure = findProcedure("POST", "/v1/contact-scans")

  test("schedules a scan for the token workspace with no session user", async () => {
    contactScanServiceSchedule.mockResolvedValueOnce({ runId: "run-1" })
    const scanFromAt = new Date("2020-01-01T00:00:00Z")

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { inboxId: "inbox-1", scanFromAt },
      }),
    ).resolves.toEqual({ runId: "run-1" })

    expect(contactScanServiceSchedule).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      requestedByUserId: null,
      scanFromAt,
    })
  })

  test("declares scheduling errors and propagates a 409 from the service", async () => {
    const error = new Error("A scan is already running for this inbox.")
    contactScanServiceSchedule.mockRejectedValueOnce(error)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { inboxId: "inbox-1", scanFromAt: new Date() },
      }),
    ).rejects.toThrow("A scan is already running for this inbox.")

    expect(procedure.errors).toBe(possibleErrorsOnSchedulingContactScan)
  })
})
