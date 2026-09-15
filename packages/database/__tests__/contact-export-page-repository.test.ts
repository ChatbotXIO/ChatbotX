import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// contactRepository.listForExportPage — the relational `with` literal moved
// here from apps/worker/src/default/handlers/export-contacts.ts so Drizzle
// keeps type inference. These assertions were relocated from
// apps/worker/__tests__/export-contacts-handler.test.ts, which can no longer
// see the query shape now that the handler only passes a boolean flag.
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

describe("contactRepository.listForExportPage", () => {
  test("passes the caller's where and limit through and keys the page on id asc", async () => {
    const where = { workspaceId: "ws-1", id: { gt: "10" } }

    await contactRepository.listForExportPage({
      where,
      limit: 2,
      includeSourceUserId: false,
    })

    expect(findManyContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        limit: 2,
        orderBy: { id: "asc" },
      }),
    )
  })

  test("always loads contactCustomFields and tags relations", async () => {
    await contactRepository.listForExportPage({
      where: {},
      limit: 2,
      includeSourceUserId: false,
    })

    const query = findManyContacts.mock.calls[0][0] as {
      with: Record<string, unknown>
    }
    expect(query.with.contactCustomFields).toBe(true)
    expect(query.with.tags).toBe(true)
  })

  test("keeps the single-row contactInboxes load when sourceUserId is not selected", async () => {
    await contactRepository.listForExportPage({
      where: {},
      limit: 2,
      includeSourceUserId: false,
    })

    const query = findManyContacts.mock.calls[0][0] as {
      with: {
        contactInboxes: {
          columns: Record<string, boolean>
          orderBy: unknown
          limit?: number
        }
      }
    }
    expect(query.with.contactInboxes.columns).toMatchObject({
      sourceId: true,
      sourceUserId: true,
    })
    expect(query.with.contactInboxes.orderBy).toEqual({ id: "asc" })
    // The Contact Id column only needs the earliest inbox row.
    expect(query.with.contactInboxes.limit).toBe(1)
  })

  test("lifts the contactInboxes limit ONLY when sourceUserId is selected", async () => {
    await contactRepository.listForExportPage({
      where: {},
      limit: 2,
      includeSourceUserId: true,
    })

    const query = findManyContacts.mock.calls[0][0] as {
      with: { contactInboxes: { limit?: number } }
    }
    // The WhatsApp User ID column must scan every inbox connection, so the
    // multi-inbox scan is only paid for when that column is actually selected.
    expect(query.with.contactInboxes.limit).toBeUndefined()
  })
})
