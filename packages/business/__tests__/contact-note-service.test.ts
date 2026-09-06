import { beforeEach, describe, expect, test, vi } from "vitest"

// contactNoteService: create/update/delete must all authorize against the
// contact (findByIdOrFail) BEFORE any write; the notes-cache tag they
// invalidate is `contacts:{contactId}:contact-notes` (the PR's advertised
// notes-cache fix); and delete of a missing note must 404 rather than
// silently succeeding, matching update's behavior.

const mocks = vi.hoisted(() => ({
  findByIdOrFail: vi.fn(),
  findOrFail: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  insertReturning: vi.fn(),
  updateReturning: vi.fn(),
  deleteReturning: vi.fn(),
}))

const insertBuilder = {
  values: vi.fn(() => insertBuilder),
  returning: (...args: unknown[]) => mocks.insertReturning(...args),
}
const updateBuilder = {
  set: vi.fn(() => updateBuilder),
  where: vi.fn(() => updateBuilder),
  returning: (...args: unknown[]) => mocks.updateReturning(...args),
}
const deleteBuilder = {
  where: vi.fn(() => deleteBuilder),
  returning: (...args: unknown[]) => mocks.deleteReturning(...args),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: vi.fn(() => insertBuilder),
    update: vi.fn(() => updateBuilder),
    delete: vi.fn(() => deleteBuilder),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  findOrFail: (...args: unknown[]) => mocks.findOrFail(...args),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactNoteModel: {
    id: "contactNoteModel.id",
    contactId: "contactNoteModel.contactId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) =>
    mocks.invalidateCacheByTags(...args),
  withCache: async (_key: string, callback: () => Promise<unknown>) =>
    await callback(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "generated-id",
}))

vi.mock("../src/contact/service", () => ({
  contactService: { findByIdOrFail: mocks.findByIdOrFail },
}))

const { contactNoteService } = await import("../src/contact-note/service")

const WORKSPACE_ID = "ws-1"
const CONTACT_ID = "contact-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("contactNoteService.create", () => {
  test("throws before writing when the contact is out of scope", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("Contact not found"))

    await expect(
      contactNoteService.create({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        text: "hello",
        createdById: "user-1",
      }),
    ).rejects.toThrow("Contact not found")

    expect(mocks.insertReturning).not.toHaveBeenCalled()
  })

  test("inserts the note and invalidates the contact-notes cache tag", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.insertReturning.mockResolvedValueOnce([
      { id: "note-1", text: "hello" },
    ])

    const result = await contactNoteService.create({
      workspaceId: WORKSPACE_ID,
      contactId: CONTACT_ID,
      text: "hello",
      createdById: "user-1",
    })

    expect(result).toEqual({ id: "note-1", text: "hello" })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      `contacts:${CONTACT_ID}:contact-notes`,
    ])
  })
})

describe("contactNoteService.update", () => {
  test("throws before writing when the contact is out of scope", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("Contact not found"))

    await expect(
      contactNoteService.update({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        noteId: "note-1",
        text: "updated",
      }),
    ).rejects.toThrow("Contact not found")

    expect(mocks.findOrFail).not.toHaveBeenCalled()
    expect(mocks.updateReturning).not.toHaveBeenCalled()
  })

  test("404s when the note does not exist", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.findOrFail.mockRejectedValueOnce(new Error("Contact note not found"))

    await expect(
      contactNoteService.update({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        noteId: "missing-note",
        text: "updated",
      }),
    ).rejects.toThrow("Contact note not found")

    expect(mocks.updateReturning).not.toHaveBeenCalled()
  })

  test("updates the note and invalidates the contact-notes cache tag", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.findOrFail.mockResolvedValueOnce({ id: "note-1" })
    mocks.updateReturning.mockResolvedValueOnce([
      { id: "note-1", text: "updated" },
    ])

    const result = await contactNoteService.update({
      workspaceId: WORKSPACE_ID,
      contactId: CONTACT_ID,
      noteId: "note-1",
      text: "updated",
    })

    expect(result).toEqual({ id: "note-1", text: "updated" })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      `contacts:${CONTACT_ID}:contact-notes`,
    ])
  })
})

describe("contactNoteService.delete", () => {
  test("throws before deleting when the contact is out of scope", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("Contact not found"))

    await expect(
      contactNoteService.delete({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        noteId: "note-1",
      }),
    ).rejects.toThrow("Contact not found")

    expect(mocks.deleteReturning).not.toHaveBeenCalled()
  })

  test("404s when zero rows were deleted (missing note), matching update's behavior", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.deleteReturning.mockResolvedValueOnce([])

    await expect(
      contactNoteService.delete({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        noteId: "missing-note",
      }),
    ).rejects.toThrow("Contact note not found")

    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("deletes the note and invalidates the contact-notes cache tag", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.deleteReturning.mockResolvedValueOnce([{ id: "note-1" }])

    await contactNoteService.delete({
      workspaceId: WORKSPACE_ID,
      contactId: CONTACT_ID,
      noteId: "note-1",
    })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      `contacts:${CONTACT_ID}:contact-notes`,
    ])
  })
})
