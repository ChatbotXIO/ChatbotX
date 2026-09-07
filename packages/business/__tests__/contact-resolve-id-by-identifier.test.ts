// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const INVALID_IDENTIFIER_FORMAT = /Invalid identifier format/

const { contactService } = await import("../src/contact/service")
const { contactRepository } = await import("@chatbotx.io/database/repositories")

describe("contactService.resolveIdByIdentifier", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("resolves an id: identifier by its numeric id", async () => {
    vi.spyOn(contactRepository, "findIdByIdentityWhere").mockResolvedValue({
      id: "123",
    } as never)

    const result = await contactService.resolveIdByIdentifier({
      workspaceId: "ws-1",
      identifier: "id:123",
    })

    expect(result).toBe("123")
    expect(contactRepository.findIdByIdentityWhere).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "123",
    })
  })

  test("resolves an email: identifier by email", async () => {
    vi.spyOn(contactRepository, "findIdByIdentityWhere").mockResolvedValue({
      id: "contact-2",
    } as never)

    const result = await contactService.resolveIdByIdentifier({
      workspaceId: "ws-1",
      identifier: "email:ada@example.com",
    })

    expect(result).toBe("contact-2")
    expect(contactRepository.findIdByIdentityWhere).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      email: "ada@example.com",
    })
  })

  test("resolves a phone: identifier by phoneNumber", async () => {
    vi.spyOn(contactRepository, "findIdByIdentityWhere").mockResolvedValue({
      id: "contact-3",
    } as never)

    const result = await contactService.resolveIdByIdentifier({
      workspaceId: "ws-1",
      identifier: "phone:+841234567890",
    })

    expect(result).toBe("contact-3")
    expect(contactRepository.findIdByIdentityWhere).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      phoneNumber: "+841234567890",
    })
  })

  test("throws not-found (404) when no contact matches", async () => {
    vi.spyOn(contactRepository, "findIdByIdentityWhere").mockResolvedValue(
      undefined,
    )

    await expect(
      contactService.resolveIdByIdentifier({
        workspaceId: "ws-1",
        identifier: "id:999",
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })
  })

  test("rejects an id: identifier with a non-numeric value before ever querying", async () => {
    const spy = vi.spyOn(contactRepository, "findIdByIdentityWhere")

    await expect(
      contactService.resolveIdByIdentifier({
        workspaceId: "ws-1",
        identifier: "id:not-a-number",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(spy).not.toHaveBeenCalled()
  })

  test("rejects an identifier with an unrecognized prefix", async () => {
    await expect(
      contactService.resolveIdByIdentifier({
        workspaceId: "ws-1",
        identifier: "username:ada",
      }),
    ).rejects.toThrow(INVALID_IDENTIFIER_FORMAT)
  })
})
