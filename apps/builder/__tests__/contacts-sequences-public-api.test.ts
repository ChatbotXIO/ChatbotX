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

const contactSequenceService = {
  listByContactId: vi.fn(),
  removeContactSequencesForContacts: vi.fn(),
  updateContactSequences: vi.fn(),
}

const resolveContactId = vi.fn()

const enrollContactsInSequences = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: resolveContactId },
}))
vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    ...contactSequenceService,
    enrollContacts: enrollContactsInSequences,
  },
}))

await import("@/features/contact-sequences/api/public")

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

describe("GET /v1/contacts/{identifier}/sequences", () => {
  const procedure = findProcedure("GET", "/v1/contacts/{identifier}/sequences")

  test("lists sequence enrollments for the resolved contact", async () => {
    contactSequenceService.listByContactId.mockResolvedValueOnce([
      { sequenceId: "seq-1", sequenceName: "Welcome" },
    ])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { identifier: "id:123" },
      }),
    ).resolves.toEqual({
      data: [{ sequenceId: "seq-1", sequenceName: "Welcome" }],
    })

    expect(contactSequenceService.listByContactId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })
})

describe("POST /v1/contacts/{identifier}/sequences", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/sequences")

  test("enrolls the single resolved contact into the given sequences", async () => {
    enrollContactsInSequences.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", sequenceIds: ["seq-1", "seq-2"] },
    })

    expect(enrollContactsInSequences).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      sequenceIds: ["seq-1", "seq-2"],
    })
  })
})

describe("DELETE /v1/contacts/{identifier}/sequences", () => {
  const procedure = findProcedure(
    "DELETE",
    "/v1/contacts/{identifier}/sequences",
  )

  test("removes the enrollment with reason enrollment_removed", async () => {
    contactSequenceService.removeContactSequencesForContacts.mockResolvedValueOnce(
      [],
    )

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", sequenceIds: ["seq-1"] },
    })

    expect(
      contactSequenceService.removeContactSequencesForContacts,
    ).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      sequenceIds: ["seq-1"],
      reason: "enrollment_removed",
    })
  })
})

describe("PUT /v1/contacts/{identifier}/sequences", () => {
  const procedure = findProcedure("PUT", "/v1/contacts/{identifier}/sequences")

  test("replaces enrollments via updateContactSequences", async () => {
    contactSequenceService.updateContactSequences.mockResolvedValueOnce({})

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", sequenceIds: ["seq-3"] },
    })

    expect(contactSequenceService.updateContactSequences).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      sequenceIds: ["seq-3"],
    })
  })
})
