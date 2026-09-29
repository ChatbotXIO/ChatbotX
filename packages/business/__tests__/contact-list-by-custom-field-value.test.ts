// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// contactService.listByCustomFieldValue (packages/business/src/contact/list.ts)
//
// Back-compat helper behind the deprecated `contacts.findByCustomField`
// public alias (the canonical replacement is `contacts.list` with a
// `contactFilter`). Covers the three-way branch on `customFieldId`:
//  - "email"/"phone" magic values map onto the native columns.
//  - any other value addresses a real custom-field row via
//    `contactCustomFields: { customFieldId, value }`.
//  - the fixed 100-row cap and `updatedAt desc` ordering the deleted public
//    endpoint documented ("maximum 100 contacts ... sorted by the last
//    custom field value update").
// ---------------------------------------------------------------------------

const { contactRepository } = await import("@chatbotx.io/database/repositories")
const { listByCustomFieldValue } = await import("../src/contact/list")

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(contactRepository, "listPublicByCustomField").mockResolvedValue({
    data: [],
  } as never)
})

describe("contactService.listByCustomFieldValue", () => {
  test("customFieldId 'email' maps to the native email column", async () => {
    const spy = vi.spyOn(contactRepository, "listPublicByCustomField")

    await listByCustomFieldValue({
      workspaceId: "ws-1",
      customFieldId: "email",
      value: "ada@example.com",
    })

    expect(spy).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", email: "ada@example.com" },
      limit: 100,
      orderBy: { updatedAt: "desc" },
    })
  })

  test("customFieldId 'phone' maps to the native phoneNumber column", async () => {
    const spy = vi.spyOn(contactRepository, "listPublicByCustomField")

    await listByCustomFieldValue({
      workspaceId: "ws-1",
      customFieldId: "phone",
      value: "+15551234567",
    })

    expect(spy).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", phoneNumber: "+15551234567" },
      limit: 100,
      orderBy: { updatedAt: "desc" },
    })
  })

  test("any other customFieldId addresses a real custom-field row", async () => {
    const spy = vi.spyOn(contactRepository, "listPublicByCustomField")

    await listByCustomFieldValue({
      workspaceId: "ws-1",
      customFieldId: "cf-1",
      value: "gold",
    })

    expect(spy).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        contactCustomFields: { customFieldId: "cf-1", value: "gold" },
      },
      limit: 100,
      orderBy: { updatedAt: "desc" },
    })
  })

  test("returns an empty data array when nothing matches", async () => {
    vi.spyOn(contactRepository, "listPublicByCustomField").mockResolvedValue({
      data: [],
    } as never)

    const result = await listByCustomFieldValue({
      workspaceId: "ws-1",
      customFieldId: "cf-1",
      value: "no-such-value",
    })

    expect(result).toEqual({ data: [] })
  })

  test("passes through whatever the repository returns, capped at 100 rows", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: `contact-${i}` }))
    vi.spyOn(contactRepository, "listPublicByCustomField").mockResolvedValue({
      data: rows,
    } as never)

    const result = await listByCustomFieldValue({
      workspaceId: "ws-1",
      customFieldId: "cf-1",
      value: "gold",
    })

    expect(result.data).toHaveLength(100)
    expect(contactRepository.listPublicByCustomField).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    )
  })
})
