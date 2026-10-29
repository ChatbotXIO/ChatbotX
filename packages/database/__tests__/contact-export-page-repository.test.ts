import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// contactRepository.listForExportPage: the relational `with` it builds from
// the relations the export handler resolves from its selected columns.
// ---------------------------------------------------------------------------

const findManyContacts = vi.fn()

vi.mock("../src/client", () => ({
  db: {
    query: {
      contactModel: {
        findMany: (...args: unknown[]) => findManyContacts(...args),
      },
    },
  },
}))

const { contactRepository } = await import(
  "../src/repositories/contact/repository"
)

beforeEach(() => {
  findManyContacts.mockReset()
  findManyContacts.mockResolvedValue([])
})

const noRelations = {
  customFieldIds: [],
  tagIds: [],
  contactInboxes: "none",
} as const

const withOf = async (relations: Record<string, unknown>) => {
  await contactRepository.listForExportPage({
    where: {},
    limit: 2,
    relations: { ...noRelations, ...relations },
  })
  return (
    findManyContacts.mock.calls[0][0] as {
      with: Record<string, Record<string, unknown>>
    }
  ).with
}

describe("contactRepository.listForExportPage", () => {
  test("passes the caller's where and limit through and keys the page on id asc", async () => {
    const where = { workspaceId: "ws-1", id: { gt: "10" } }

    await contactRepository.listForExportPage({
      where,
      limit: 2,
      relations: noRelations,
    })

    expect(findManyContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        limit: 2,
        orderBy: { id: "asc" },
      }),
    )
  })

  test("loads no relation when no column needs one", async () => {
    expect(await withOf({})).toEqual({})
  })

  test("loads only the selected custom fields, with just the columns a cell renders", async () => {
    const relations = await withOf({ customFieldIds: ["cf-1", "cf-2"] })

    expect(relations).toEqual({
      contactCustomFields: {
        columns: { customFieldId: true, value: true },
        where: { customFieldId: { in: ["cf-1", "cf-2"] } },
      },
    })
  })

  test("loads only the selected tags", async () => {
    const relations = await withOf({ tagIds: ["t-1"] })

    expect(relations).toEqual({
      tags: { columns: { id: true }, where: { id: { in: ["t-1"] } } },
    })
  })

  test("loads the earliest inbox row for the Contact Id column", async () => {
    const relations = await withOf({ contactInboxes: "earliest" })

    expect(relations.contactInboxes).toEqual({
      columns: { sourceId: true, sourceUserId: true },
      orderBy: { id: "asc" },
      limit: 1,
    })
  })

  test("loads every inbox row for the WhatsApp User ID column", async () => {
    const relations = await withOf({ contactInboxes: "all" })

    expect(relations.contactInboxes).not.toHaveProperty("limit")
  })
})
