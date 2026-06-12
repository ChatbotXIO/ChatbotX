import { systemFieldTypes } from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import { describe, expect, test, vi } from "vitest"

const {
  mockFindLatestContactLastReadAt,
  mockFindLatestLastIncomingMessageAt,
  mockResolveTenantSettings,
  mockWorkspaceFind,
} = vi.hoisted(() => ({
  mockFindLatestContactLastReadAt: vi.fn(),
  mockFindLatestLastIncomingMessageAt: vi.fn(),
  mockResolveTenantSettings: vi.fn(),
  mockWorkspaceFind: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    findLatestContactLastReadAtByContactId: mockFindLatestContactLastReadAt,
    findLatestLastIncomingMessageAtByContactId:
      mockFindLatestLastIncomingMessageAt,
  },
  resolveTenantSettings: mockResolveTenantSettings,
  workspaceService: {
    find: mockWorkspaceFind,
  },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
}))

const { getSystemFieldValue } = await import("../src/utils")

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  timezone: "UTC",
} as ContactModel

describe("getSystemFieldValue", () => {
  test("profile_pic resolves storage paths to public URLs", async () => {
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "http://localhost:3123/storage/",
    })

    await expect(
      getSystemFieldValue(
        {
          ...contact,
          avatar: "public/space/workspace-1/avatars/a.png",
        } as ContactModel,
        systemFieldTypes.enum.profile_pic,
      ),
    ).resolves.toBe(
      "http://localhost:3123/storage/public/space/workspace-1/avatars/a.png",
    )
  })

  test("avatar keeps absolute URLs and leaves null as null", async () => {
    await expect(
      getSystemFieldValue(
        {
          ...contact,
          avatar: "https://cdn.example.com/a.png",
        } as ContactModel,
        systemFieldTypes.enum.avatar,
      ),
    ).resolves.toBe("https://cdn.example.com/a.png")

    await expect(
      getSystemFieldValue(
        {
          ...contact,
          avatar: null,
        } as ContactModel,
        systemFieldTypes.enum.avatar,
      ),
    ).resolves.toBeNull()
  })

  test("account_image resolves workspace logo storage paths", async () => {
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "http://localhost:3123/storage/",
    })
    mockWorkspaceFind.mockResolvedValue({
      logo: "public/space/workspace-1/logo.png",
    })

    await expect(
      getSystemFieldValue(contact, systemFieldTypes.enum.account_image),
    ).resolves.toBe(
      "http://localhost:3123/storage/public/space/workspace-1/logo.png",
    )
  })

  test("locale2 returns the language from underscore and hyphen locales", async () => {
    await expect(
      getSystemFieldValue(
        { ...contact, locale: "en_US" } as ContactModel,
        systemFieldTypes.enum.locale2,
      ),
    ).resolves.toBe("en")

    await expect(
      getSystemFieldValue(
        { ...contact, locale: "en-US" } as ContactModel,
        systemFieldTypes.enum.locale2,
      ),
    ).resolves.toBe("en")
  })

  test("last_seen uses the latest contact inbox read timestamp", async () => {
    mockFindLatestContactLastReadAt.mockResolvedValue(
      new Date("2026-01-02T03:04:05.000Z"),
    )

    await expect(
      getSystemFieldValue(contact, systemFieldTypes.enum.last_seen),
    ).resolves.toBe("2026-01-02 03:04:05")
    expect(mockFindLatestContactLastReadAt).toHaveBeenCalledWith({
      contactId: "contact-1",
    })
  })

  test("last_interaction uses the latest inbound contact inbox timestamp", async () => {
    mockFindLatestLastIncomingMessageAt.mockResolvedValue(
      new Date("2026-01-02T03:04:05.000Z"),
    )

    await expect(
      getSystemFieldValue(contact, systemFieldTypes.enum.last_interaction),
    ).resolves.toBe("2026-01-02 03:04:05")
    expect(mockFindLatestLastIncomingMessageAt).toHaveBeenCalledWith({
      contactId: "contact-1",
    })
  })

  test("last_seen and last_interaction return null when no inbox timestamp exists", async () => {
    mockFindLatestContactLastReadAt.mockResolvedValue(null)
    mockFindLatestLastIncomingMessageAt.mockResolvedValue(null)

    await expect(
      getSystemFieldValue(contact, systemFieldTypes.enum.last_seen),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(contact, systemFieldTypes.enum.last_interaction),
    ).resolves.toBeNull()
  })

  test("last_seen formats using the contact timezone", async () => {
    mockFindLatestContactLastReadAt.mockResolvedValue(
      new Date("2026-01-01T23:30:00.000Z"),
    )

    await expect(
      getSystemFieldValue(
        { ...contact, timezone: "Asia/Ho_Chi_Minh" } as ContactModel,
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-02 06:30:00")
  })

  test("last_interaction formats date and time using the contact timezone", async () => {
    mockFindLatestLastIncomingMessageAt.mockResolvedValue(
      new Date("2026-01-01T23:30:00.000Z"),
    )

    await expect(
      getSystemFieldValue(
        { ...contact, timezone: "Asia/Ho_Chi_Minh" } as ContactModel,
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBe("2026-01-02 06:30:00")
  })

  test("last_seen and last_interaction fall back to UTC when timezone is null", async () => {
    const utcContact = { ...contact, timezone: null } as ContactModel
    mockFindLatestContactLastReadAt.mockResolvedValue(
      new Date("2026-01-01T23:30:00.000Z"),
    )
    mockFindLatestLastIncomingMessageAt.mockResolvedValue(
      new Date("2026-01-01T23:30:00.000Z"),
    )

    await expect(
      getSystemFieldValue(utcContact, systemFieldTypes.enum.last_seen),
    ).resolves.toBe("2026-01-01 23:30:00")
    await expect(
      getSystemFieldValue(utcContact, systemFieldTypes.enum.last_interaction),
    ).resolves.toBe("2026-01-01 23:30:00")
  })

  test("last_seen falls back to UTC when timezone is invalid", async () => {
    mockFindLatestContactLastReadAt.mockResolvedValue(
      new Date("2026-01-01T23:30:00.000Z"),
    )

    await expect(
      getSystemFieldValue(
        { ...contact, timezone: "7" } as ContactModel,
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-01 23:30:00")
  })
})
