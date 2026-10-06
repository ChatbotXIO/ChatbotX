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
const removeContactTags = vi.fn()

const deleteContact = vi.fn()

const subscribeContactsToSequences = vi.fn()
const unsubscribeContactsFromSequences = vi.fn()
const findBroadcast = vi.fn()
const assertSequenceOwned = vi.fn()
const enqueueBulkTagStats = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: { findByIdOrName: findBroadcast },
  contactService: { deleteAndRecord: deleteContact },
  tagService: {
    attachByNamesToContacts: addContactTags,
    detachByNamesFromContacts: removeContactTags,
  },
}))
vi.mock("@chatbotx.io/business/sequence", () => ({
  sequenceService: { assertOwned: assertSequenceOwned },
}))
vi.mock("@/features/contacts/lib/enqueue-bulk-tag-stats", () => ({
  enqueueBulkTagStatsContacts: enqueueBulkTagStats,
}))
vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    subscribeContacts: subscribeContactsToSequences,
    unsubscribeContacts: unsubscribeContactsFromSequences,
  },
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
    addContactTags.mockResolvedValueOnce({
      processedContactIds: ["1", "2", "3"],
      skippedContactIds: [],
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { contactIds: ["1", "2", "3"], tags: ["VIP"] },
    })

    expect(addContactTags).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["1", "2", "3"],
      names: ["VIP"],
    })
    expect(result).toEqual({ processed: 3, skippedContactIds: [] })
  })
})

describe("POST /v1/contacts/bulk/tags/remove", () => {
  const procedure = findProcedure("POST", "/v1/contacts/bulk/tags/remove")

  test("detaches the named tags and reports skipped contact ids", async () => {
    removeContactTags.mockResolvedValueOnce({
      processedContactIds: ["1", "2"],
      skippedContactIds: ["9"],
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { contactIds: ["1", "2", "9"], tags: ["VIP", "Lead"] },
    })

    expect(removeContactTags).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["1", "2", "9"],
      names: ["VIP", "Lead"],
    })
    expect(result).toEqual({ processed: 2, skippedContactIds: ["9"] })
  })
})

describe("POST /v1/contacts/bulk/delete", () => {
  const procedure = findProcedure("POST", "/v1/contacts/bulk/delete")

  test("delegates to deleteContact with all given contact ids", async () => {
    deleteContact.mockResolvedValueOnce({
      processedContactIds: ["1", "2"],
      skippedContactIds: [],
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { contactIds: ["1", "2"] },
    })

    expect(deleteContact).toHaveBeenCalledWith({
      triggerSource: "api",
      workspaceId: "workspace-1",
      ids: ["1", "2"],
    })
    expect(result).toEqual({ processed: 2, skippedContactIds: [] })
  })
})

describe("POST /v1/contacts/bulk/sequences", () => {
  const procedure = findProcedure("POST", "/v1/contacts/bulk/sequences")

  test("delegates to subscribeContactsToSequences with all given contact ids", async () => {
    subscribeContactsToSequences.mockResolvedValueOnce({
      processedContactIds: ["1", "2"],
      skippedContactIds: [],
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { contactIds: ["1", "2"], sequenceIds: ["seq-1"] },
    })

    expect(subscribeContactsToSequences).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["1", "2"],
      sequenceIds: ["seq-1"],
    })
    expect(result).toEqual({ processed: 2, skippedContactIds: [] })
  })
})

describe("POST /v1/contacts/bulk/sequences/remove", () => {
  const procedure = findProcedure("POST", "/v1/contacts/bulk/sequences/remove")

  test("unsubscribes the contacts and reports skipped ids", async () => {
    unsubscribeContactsFromSequences.mockResolvedValueOnce({
      processedContactIds: ["1"],
      skippedContactIds: ["2"],
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { contactIds: ["1", "2"], sequenceIds: ["seq-1"] },
    })

    expect(unsubscribeContactsFromSequences).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["1", "2"],
      sequenceIds: ["seq-1"],
    })
    expect(result).toEqual({ processed: 1, skippedContactIds: ["2"] })
  })
})

describe("POST /v1/contacts/bulk/tags/by-stats", () => {
  const procedure = findProcedure("POST", "/v1/contacts/bulk/tags/by-stats")
  const context = { workspace: { id: "workspace-1", ownerId: "owner-1" } }

  test("checks the broadcast belongs to the workspace, then queues the job as the owner", async () => {
    findBroadcast.mockResolvedValueOnce({ id: "b1" })
    enqueueBulkTagStats.mockResolvedValueOnce(true)
    const input = {
      source: "broadcast",
      broadcastId: "b1",
      eventType: "message:seen",
      tags: ["Engaged"],
      excludedContactIds: [],
    }

    const result = await procedure.handler?.({ context, input })

    expect(findBroadcast).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      idOrName: "b1",
    })
    expect(enqueueBulkTagStats).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      requestedUserId: "owner-1",
      request: input,
    })
    expect(result).toEqual({ queued: true })
  })

  test("queues nothing when the broadcast is not in the workspace", async () => {
    findBroadcast.mockRejectedValueOnce(new Error("Broadcast not found"))

    await expect(
      procedure.handler?.({
        context,
        input: {
          source: "broadcast",
          broadcastId: "foreign",
          eventType: "message:seen",
          tags: ["x"],
          excludedContactIds: [],
        },
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(enqueueBulkTagStats).not.toHaveBeenCalled()
  })

  test("checks sequence ownership for a sequence step source", async () => {
    assertSequenceOwned.mockRejectedValueOnce(new Error("Sequence not found"))

    await expect(
      procedure.handler?.({
        context,
        input: {
          source: "sequenceStep",
          sequenceId: "s9",
          stepId: "st1",
          eventType: "message:sent",
          tags: ["x"],
          excludedContactIds: [],
        },
      }),
    ).rejects.toThrow("Sequence not found")

    expect(assertSequenceOwned).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sequenceId: "s9",
    })
    expect(enqueueBulkTagStats).not.toHaveBeenCalled()
  })

  test("queues a comment automation source without a pre-check (scoped in the job)", async () => {
    enqueueBulkTagStats.mockResolvedValueOnce(true)

    await procedure.handler?.({
      context,
      input: {
        source: "commentAutomation",
        automationId: "a1",
        eventType: "message:sent",
        tags: ["x"],
        excludedContactIds: [],
      },
    })

    expect(findBroadcast).not.toHaveBeenCalled()
    expect(assertSequenceOwned).not.toHaveBeenCalled()
    expect(enqueueBulkTagStats).toHaveBeenCalledTimes(1)
  })
})
