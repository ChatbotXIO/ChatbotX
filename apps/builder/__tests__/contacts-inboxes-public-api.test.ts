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

const listContactInboxesForAPI = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: resolveContactId },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    listWithInboxNameByContactId: listContactInboxesForAPI,
  },
}))

await import("@/features/contact-inboxes/api/public")

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

describe("GET /v1/contacts/{identifier}/inboxes", () => {
  const procedure = findProcedure("GET", "/v1/contacts/{identifier}/inboxes")

  test("resolves the identifier then lists channel identities for that contact", async () => {
    listContactInboxesForAPI.mockResolvedValueOnce([
      { id: "ci-1", channel: "whatsapp", inbox: { name: "Sales" } },
    ])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { identifier: "phone:+841234567890" },
      }),
    ).resolves.toEqual({
      data: [{ id: "ci-1", channel: "whatsapp", inbox: { name: "Sales" } }],
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "phone:+841234567890",
      workspaceId: "workspace-1",
    })
    expect(listContactInboxesForAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })
})
