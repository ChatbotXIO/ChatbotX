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

const contactNoteService = { listByContactId: vi.fn() }

const resolveContactId = vi.fn()

const createContactNote = vi.fn()

const editContactNote = vi.fn()

const deleteContactNote = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: resolveContactId },
  contactNoteService: {
    ...contactNoteService,
    create: createContactNote,
    update: editContactNote,
    delete: deleteContactNote,
  },
}))

await import("@/features/contact-notes/api/public")

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

describe("GET /v1/contacts/{identifier}/notes", () => {
  const procedure = findProcedure("GET", "/v1/contacts/{identifier}/notes")

  test("resolves the identifier then lists notes by contact id", async () => {
    contactNoteService.listByContactId.mockResolvedValueOnce([
      { id: "note-1", text: "hello" },
    ])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { identifier: "email:a@b.com" },
      }),
    ).resolves.toEqual({ data: [{ id: "note-1", text: "hello" }] })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "email:a@b.com",
      workspaceId: "workspace-1",
    })
    expect(contactNoteService.listByContactId).toHaveBeenCalledWith({
      contactId: "contact-1",
    })
  })
})

describe("POST /v1/contacts/{identifier}/notes", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/notes")

  test("creates a note with a null userId (no session for a token caller)", async () => {
    createContactNote.mockResolvedValueOnce({ id: "note-1", text: "hi" })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", text: "hi" },
    })

    expect(result).toEqual({ id: "note-1", text: "hi" })
    expect(createContactNote).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      createdById: null,
      text: "hi",
    })
  })
})

describe("PUT /v1/contacts/{identifier}/notes/{noteId}", () => {
  const procedure = findProcedure(
    "PUT",
    "/v1/contacts/{identifier}/notes/{noteId}",
  )

  test("delegates to editContactNote with the resolved contact id", async () => {
    editContactNote.mockResolvedValueOnce({ id: "note-1", text: "updated" })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", noteId: "note-1", text: "updated" },
    })

    expect(result).toEqual({ id: "note-1", text: "updated" })
    expect(editContactNote).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      noteId: "note-1",
      text: "updated",
    })
  })
})

describe("DELETE /v1/contacts/{identifier}/notes/{noteId}", () => {
  const procedure = findProcedure(
    "DELETE",
    "/v1/contacts/{identifier}/notes/{noteId}",
  )

  test("delegates to deleteContactNote", async () => {
    deleteContactNote.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", noteId: "note-1" },
    })

    expect(deleteContactNote).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      noteId: "note-1",
    })
  })
})
