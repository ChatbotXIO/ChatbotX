// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { getContact } from "@/features/contacts/queries/get-contact.query"

const { mockFindDetailOrFail, mockMaskContactEmailAndPhone } = vi.hoisted(
  () => ({
    mockFindDetailOrFail: vi.fn(),
    mockMaskContactEmailAndPhone: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  contactService: { findDetailOrFail: mockFindDetailOrFail },
}))

vi.mock("@/features/contacts/permissions", () => ({
  maskContactEmailAndPhone: mockMaskContactEmailAndPhone,
}))

vi.mock("@/features/contacts/queries/resolve-contact-avatars", () => ({
  resolveContactAvatars: vi.fn(async (contacts) => contacts),
}))

describe("getContact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("applies assigned-contact scope and masks PII for restricted members", async () => {
    const contact = {
      id: "contact-1",
      email: "ada@example.com",
      phoneNumber: "+12025550123",
      conversation: null,
      contactCustomFields: [],
    }
    const maskedContact = {
      id: "contact-1",
      email: null,
      phoneNumber: null,
    }
    const scope = {
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: "user-1",
    }
    mockFindDetailOrFail.mockResolvedValue(contact)
    mockMaskContactEmailAndPhone.mockReturnValue(maskedContact)

    await expect(
      getContact({ contactId: "contact-1", workspaceId: "workspace-1" }, scope),
    ).resolves.toEqual({ ...maskedContact, customFields: [] })

    expect(mockFindDetailOrFail).toHaveBeenCalledWith({
      accessScope: { restrictToAssignedUserId: "user-1" },
      id: "contact-1",
      workspaceId: "workspace-1",
    })
    expect(mockMaskContactEmailAndPhone).toHaveBeenCalledWith({
      email: "ada@example.com",
      id: "contact-1",
      phoneNumber: "+12025550123",
    })
  })
})
