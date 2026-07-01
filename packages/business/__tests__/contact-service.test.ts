import type { ContactModel } from "@chatbotx.io/database/types"
import { afterEach, describe, expect, test, vi } from "vitest"
import { contactService } from "../src/contact"

const contact = (data: Partial<ContactModel>): ContactModel =>
  data as ContactModel

describe("contactService.unblockIfBlocked", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("unblocks a preloaded blocked contact without reading it again", async () => {
    const blocked = contact({
      id: "contact-1",
      workspaceId: "ws-1",
      blockedAt: new Date("2026-01-01T00:00:00Z"),
    })
    const updated = contact({ ...blocked, blockedAt: null })
    const findById = vi.spyOn(contactService, "findById")
    const unblock = vi
      .spyOn(contactService, "unblock")
      .mockResolvedValue(updated)

    await expect(
      contactService.unblockIfBlocked(
        { workspaceId: "ws-1", id: "contact-1" },
        blocked,
      ),
    ).resolves.toBe(updated)

    expect(findById).not.toHaveBeenCalled()
    expect(unblock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
  })

  test("does not update a preloaded unblocked contact", async () => {
    const findById = vi.spyOn(contactService, "findById")
    const unblock = vi.spyOn(contactService, "unblock")

    await expect(
      contactService.unblockIfBlocked(
        { workspaceId: "ws-1", id: "contact-1" },
        contact({ id: "contact-1", workspaceId: "ws-1", blockedAt: null }),
      ),
    ).resolves.toBeNull()

    expect(findById).not.toHaveBeenCalled()
    expect(unblock).not.toHaveBeenCalled()
  })

  test("reads by id when no preloaded contact is supplied", async () => {
    const blocked = contact({
      id: "contact-1",
      workspaceId: "ws-1",
      blockedAt: new Date("2026-01-01T00:00:00Z"),
    })
    const updated = contact({ ...blocked, blockedAt: null })
    const findById = vi
      .spyOn(contactService, "findById")
      .mockResolvedValue(blocked)
    const unblock = vi
      .spyOn(contactService, "unblock")
      .mockResolvedValue(updated)

    await expect(
      contactService.unblockIfBlocked({ workspaceId: "ws-1", id: "contact-1" }),
    ).resolves.toBe(updated)

    expect(findById).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
    expect(unblock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
  })

  test("does not update when the fallback read finds no blocked contact", async () => {
    const findById = vi
      .spyOn(contactService, "findById")
      .mockResolvedValue(undefined)
    const unblock = vi.spyOn(contactService, "unblock")

    await expect(
      contactService.unblockIfBlocked({ workspaceId: "ws-1", id: "contact-1" }),
    ).resolves.toBeNull()

    expect(findById).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
    expect(unblock).not.toHaveBeenCalled()
  })
})
