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

const resolveContactId = vi.fn()

const refreshContactProfile = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: resolveContactId },
}))

vi.mock("@/features/contacts/lib/refresh-contact-profile", () => ({
  refreshContactProfile,
}))

await import("@/features/contacts/api/public/refresh-profile")

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
  resolveContactId.mockResolvedValue("contact-1")
})

describe("POST /v1/contacts/{identifier}/refresh-profile", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/contacts/{identifier}/refresh-profile",
  )

  test("resolves the identifier then delegates to refreshContactProfile", async () => {
    refreshContactProfile.mockResolvedValueOnce({ status: "unavailable" })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { identifier: "id:123", contactInboxId: "ci-1" },
      }),
    ).resolves.toEqual({ status: "unavailable" })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(refreshContactProfile).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "ci-1",
    })
  })
})
