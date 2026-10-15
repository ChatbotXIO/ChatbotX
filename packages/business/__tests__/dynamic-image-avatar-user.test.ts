import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findContact: vi.fn(),
  resolveTenantSettings: vi.fn(),
  ensureAvatarMirrored: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
  db: { query: { contactModel: { findFirst: mocks.findContact } } },
}))
vi.mock("@chatbotx.io/filesystem", () => ({ uploader: {} }))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => "id",
}))
vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: { findValue: vi.fn() },
}))
vi.mock("../src/net/ssrf-guard", () => ({ isSsrfUnsafeUrl: vi.fn() }))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
  resolveWorkspaceAppUrl: vi.fn(async () => "https://app.example.com"),
}))
vi.mock("../src/dynamic-image/render", () => ({
  renderDynamicLayer: vi.fn(),
  renderStaticLayer: vi.fn(),
}))

const { dynamicImageService } = await import("../src/dynamic-image/service")

const messengerInbox = { id: "ci-1", channel: "messenger" }

const avatarDocument = {
  elements: [{ type: "image", imageType: "avatarUser", id: "avatar-layer" }],
} as never

const resolve = (
  options: {
    contactInbox?: typeof messengerInbox | null
    ensureAvatarMirrored?: typeof mocks.ensureAvatarMirrored
  } = {},
) =>
  dynamicImageService.resolveDynamicElements({
    workspaceId: "ws-1",
    contactId: "contact-1",
    contactInbox: messengerInbox,
    ensureAvatarMirrored: mocks.ensureAvatarMirrored,
    document: avatarDocument,
    ...options,
  } as never)

const layerUrl = (document: unknown) =>
  (document as { elements: { url?: string }[] }).elements[0]?.url

describe("dynamic image avatarUser layer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com/",
    })
  })

  test("fetches the picture of a lazy contact that has none stored yet", async () => {
    // A new Messenger/Instagram contact is created without its picture: the
    // layer must trigger the mirror instead of rendering blank.
    mocks.findContact.mockResolvedValue({ avatar: null })
    mocks.ensureAvatarMirrored.mockResolvedValue({
      avatar: "public/ws/ws-1/2026/10/14/avatars/abc",
    })

    const document = await resolve()

    expect(mocks.ensureAvatarMirrored).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
    })
    expect(layerUrl(document)).toBe(
      "https://storage.example.com/public/ws/ws-1/2026/10/14/avatars/abc",
    )
  })

  test("uses a stored picture as-is without touching the provider", async () => {
    mocks.findContact.mockResolvedValue({
      avatar: "public/ws/ws-1/2026/10/14/avatars/abc",
    })

    const document = await resolve()

    expect(mocks.ensureAvatarMirrored).not.toHaveBeenCalled()
    expect(layerUrl(document)).toBe(
      "https://storage.example.com/public/ws/ws-1/2026/10/14/avatars/abc",
    )
  })

  test("leaves the layer without a picture when the provider has none to give", async () => {
    mocks.findContact.mockResolvedValue({ avatar: null })
    mocks.ensureAvatarMirrored.mockResolvedValue(null)

    const document = await resolve()

    expect(layerUrl(document)).toBeUndefined()
  })

  test("leaves the layer without a picture when the contact has no inbox to ask", async () => {
    mocks.findContact.mockResolvedValue({ avatar: null })

    const document = await resolve({ contactInbox: null })

    expect(mocks.ensureAvatarMirrored).not.toHaveBeenCalled()
    expect(layerUrl(document)).toBeUndefined()
  })

  test("never renders the no-avatar sentinel as if it were a storage key", async () => {
    mocks.findContact.mockResolvedValue({
      avatar: `public/img/no_avatar.jpg?time=${Date.now()}`,
    })

    const document = await resolve()

    expect(layerUrl(document)).toBe(
      "https://app.example.com/media/default-avatar.svg",
    )
  })
})
