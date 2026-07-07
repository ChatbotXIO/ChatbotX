import { systemFieldTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { describe, expect, test, vi } from "vitest"

const { mockResolveTenantSettings } = vi.hoisted(() => ({
  mockResolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  resolveTenantSettings: mockResolveTenantSettings,
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

const contactInbox = {
  id: "contact-inbox-1",
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  contactLastReadAt: new Date("2026-01-02T03:04:05.000Z"),
  lastIncomingMessageAt: new Date("2026-01-02T03:04:05.000Z"),
} as ContactInboxModel

const workspace = {
  id: "workspace-1",
  name: "Workspace One",
  logo: null,
  timezone: "UTC",
} as WorkspaceModel

const createContext = (overrides?: {
  contact?: ContactModel
  contactInbox?: ContactInboxModel | null
  workspace?: WorkspaceModel | null
}) => ({
  contact: overrides?.contact ?? contact,
  contactInbox:
    overrides && "contactInbox" in overrides
      ? overrides.contactInbox
      : contactInbox,
  workspace:
    overrides && "workspace" in overrides ? overrides.workspace : workspace,
})

describe("getSystemFieldValue", () => {
  test("profile_pic resolves storage paths to public URLs", async () => {
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "http://localhost:3123/storage/",
    })

    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...contact,
            avatar: "public/space/workspace-1/avatars/a.png",
          } as ContactModel,
        }),
        systemFieldTypes.enum.profile_pic,
      ),
    ).resolves.toBe(
      "http://localhost:3123/storage/public/space/workspace-1/avatars/a.png",
    )
  })

  test("avatar keeps absolute URLs and leaves null as null", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...contact,
            avatar: "https://cdn.example.com/a.png",
          } as ContactModel,
        }),
        systemFieldTypes.enum.avatar,
      ),
    ).resolves.toBe("https://cdn.example.com/a.png")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...contact,
            avatar: null,
          } as ContactModel,
        }),
        systemFieldTypes.enum.avatar,
      ),
    ).resolves.toBeNull()
  })

  test("account_image resolves workspace logo storage paths", async () => {
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "http://localhost:3123/storage/",
    })

    await expect(
      getSystemFieldValue(
        createContext({
          workspace: {
            ...workspace,
            logo: "public/space/workspace-1/logo.png",
          } as WorkspaceModel,
        }),
        systemFieldTypes.enum.account_image,
      ),
    ).resolves.toBe(
      "http://localhost:3123/storage/public/space/workspace-1/logo.png",
    )
  })

  test("locale2 returns the language from underscore and hyphen locales", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, locale: "en_US" } as ContactModel,
        }),
        systemFieldTypes.enum.locale2,
      ),
    ).resolves.toBe("en")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, locale: "en-US" } as ContactModel,
        }),
        systemFieldTypes.enum.locale2,
      ),
    ).resolves.toBe("en")
  })

  test("last_seen uses the context contact inbox read timestamp", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: new Date("2026-01-03T03:04:05.000Z"),
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-03 03:04:05")
  })

  test("last_interaction uses the context contact inbox inbound timestamp", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            lastIncomingMessageAt: new Date("2026-01-03T03:04:05.000Z"),
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBe("2026-01-03 03:04:05")
  })

  test("last_seen and last_interaction return null when no inbox timestamp exists", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: null,
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            lastIncomingMessageAt: null,
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBeNull()
  })

  test("subscribed_date formats the context contact inbox createdAt", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            createdAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: { ...workspace, timezone: "Asia/Ho_Chi_Minh" },
        }),
        systemFieldTypes.enum.subscribed_date,
      ),
    ).resolves.toBe("2026-01-02")
  })

  test("subscribed_date returns null without a context contact inbox", async () => {
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: null }),
        systemFieldTypes.enum.subscribed_date,
      ),
    ).resolves.toBeNull()
  })

  test("last_seen formats using the workspace timezone before contact timezone", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "UTC" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: { ...workspace, timezone: "Asia/Ho_Chi_Minh" },
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-02 06:30:00")
  })

  test("last_interaction falls back to the contact timezone when workspace is missing", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "Asia/Ho_Chi_Minh" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            lastIncomingMessageAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: null,
        }),
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBe("2026-01-02 06:30:00")
  })

  test("last_seen and last_interaction fall back to UTC when timezone is null", async () => {
    const utcContact = { ...contact, timezone: null } as ContactModel

    await expect(
      getSystemFieldValue(
        createContext({
          contact: utcContact,
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: null,
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-01 23:30:00")
    await expect(
      getSystemFieldValue(
        createContext({
          contact: utcContact,
          contactInbox: {
            ...contactInbox,
            lastIncomingMessageAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: null,
        }),
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBe("2026-01-01 23:30:00")
  })

  test("last_seen falls back to UTC when timezone is invalid", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "7" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: null,
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-01 23:30:00")
  })
})
