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

const addContactTags = vi.fn()

const deleteContact = vi.fn()

const enrollContactsInSequences = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { deleteAndRecord: deleteContact },
  tagService: { attachByNamesToContacts: addContactTags },
}))
vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: { enrollContacts: enrollContactsInSequences },
}))

await import("@/features/contacts/api/public/bulk")

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

describe("POST /v1/contacts/bulk/tags", () => {
  const procedure = findProcedure("POST", "/v1/contacts/bulk/tags")

  test("delegates to addContactTags with all given contact ids", async () => {
    addContactTags.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { contactIds: ["1", "2", "3"], tags: ["VIP"] },
    })

    expect(addContactTags).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["1", "2", "3"],
      names: ["VIP"],
    })
  })
})

describe("POST /v1/contacts/bulk/delete", () => {
  const procedure = findProcedure("POST", "/v1/contacts/bulk/delete")

  test("delegates to deleteContact with all given contact ids", async () => {
    deleteContact.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { contactIds: ["1", "2"] },
    })

    expect(deleteContact).toHaveBeenCalledWith({
      triggerSource: "api",
      workspaceId: "workspace-1",
      ids: ["1", "2"],
    })
  })
})

describe("POST /v1/contacts/bulk/sequences", () => {
  const procedure = findProcedure("POST", "/v1/contacts/bulk/sequences")

  test("delegates to enrollContactsInSequences with all given contact ids", async () => {
    enrollContactsInSequences.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { contactIds: ["1", "2"], sequenceIds: ["seq-1"] },
    })

    expect(enrollContactsInSequences).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["1", "2"],
      sequenceIds: ["seq-1"],
    })
  })
})
