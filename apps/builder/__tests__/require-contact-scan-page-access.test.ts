// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockNotFound = vi.fn(() => {
  throw new Error("notFound")
})
vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}))

vi.mock(
  "@/features/contact-scan/lib/require-unrestricted-contacts-scope",
  () => ({
    requireUnrestrictedContactsScope: vi.fn(),
  }),
)

const { requireContactScanPageAccess } = await import(
  "@/features/contact-scan/lib/require-contact-scan-page-access"
)
const { requireUnrestrictedContactsScope } = await import(
  "@/features/contact-scan/lib/require-unrestricted-contacts-scope"
)

describe("requireContactScanPageAccess", () => {
  beforeEach(() => {
    vi.mocked(requireUnrestrictedContactsScope).mockReset()
    mockNotFound.mockClear()
  })

  test("resolves silently when the caller has an unrestricted contacts scope", async () => {
    vi.mocked(requireUnrestrictedContactsScope).mockResolvedValue({
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: undefined,
    })

    await expect(
      requireContactScanPageAccess("workspace-1"),
    ).resolves.toBeUndefined()
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  test("calls notFound (never lets the exception reach the page render) for an assigned-only member", async () => {
    vi.mocked(requireUnrestrictedContactsScope).mockRejectedValue(
      new ChatbotXException(
        "You do not have permission to run an Automatic Customer Scan.",
        "contactScanForbidden",
        403,
      ),
    )

    await expect(requireContactScanPageAccess("workspace-1")).rejects.toThrow(
      "notFound",
    )
    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })

  test("re-throws a non-ChatbotXException error instead of masking it as notFound", async () => {
    const unexpected = new Error("boom")
    vi.mocked(requireUnrestrictedContactsScope).mockRejectedValue(unexpected)

    await expect(requireContactScanPageAccess("workspace-1")).rejects.toBe(
      unexpected,
    )
    expect(mockNotFound).not.toHaveBeenCalled()
  })
})
