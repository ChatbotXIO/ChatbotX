import { beforeEach, describe, expect, test, vi } from "vitest"
import { MAX_INBOX_AVATARS, publishDestinationService } from "../service"

const mocks = vi.hoisted(() => ({
  buildUrls: vi.fn(),
  ensureForInboxes: vi.fn(async () => []),
  list: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  MAX_PUBLISH_INBOXES_PER_PROVIDER: 200,
  publishDestinationRepository: { ensureForInboxes: mocks.ensureForInboxes },
  publishDestinationStateRepository: { list: mocks.list },
}))
vi.mock("../../platform/settings", () => ({
  resolveTenantSettings: async () => ({
    storageUrl: "https://cdn.example.com/bucket/",
  }),
}))
vi.mock("../avatar-url", () => ({
  buildDestinationAvatarUrls: mocks.buildUrls,
}))
vi.mock("../../base.service", () => ({ BaseService: class {} }))

const row = (index: number, overrides: Record<string, unknown> = {}) => ({
  avatar: null,
  avatarFetchedAt: null,
  checkedAt: null,
  externalId: `e${index}`,
  id: `d${index}`,
  inboxId: `i${index}`,
  integrationId: `n${index}`,
  missingScopes: [],
  name: `Page ${index}`,
  pausedUntil: null,
  pauseReason: null,
  profileUrl: null,
  provider: "facebook",
  publisherKey: "facebook",
  socialAccountId: null,
  state: "ready",
  username: null,
  viaFacebook: false,
  ...overrides,
})

describe("publishDestinationService.listInboxAvatars", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildUrls.mockImplementation(
      async (input: { publishDestinationIds: string[] }) =>
        new Map(
          input.publishDestinationIds.map((id) => [
            id,
            `https://app.example/media/destination-avatar/${id}`,
          ]),
        ),
    )
  })

  test("reads nothing for no inbox", async () => {
    const result = await publishDestinationService.listInboxAvatars({
      inboxIds: [],
      workspaceId: "w1",
    })

    expect(result).toEqual([])
    expect(mocks.ensureForInboxes).not.toHaveBeenCalled()
    expect(mocks.list).not.toHaveBeenCalled()
  })

  test("binds the inboxes, then returns the stored picture or the on-view URL", async () => {
    mocks.list.mockResolvedValue([
      row(1, {
        avatar: "public/space/w1/publish-destinations/d1/abc",
        avatarFetchedAt: new Date(),
      }),
      row(2),
      row(3, { state: "inboxDisconnected" }),
    ])

    const result = await publishDestinationService.listInboxAvatars({
      inboxIds: ["i1", "i2", "i2", "i3", "whatsapp-inbox"],
      workspaceId: "w1",
    })

    expect(mocks.ensureForInboxes).toHaveBeenCalledWith({
      inboxIds: ["i1", "i2", "i3", "whatsapp-inbox"],
      workspaceId: "w1",
    })
    expect(mocks.list).toHaveBeenCalledWith({
      inboxIds: ["i1", "i2", "i3", "whatsapp-inbox"],
      workspaceId: "w1",
    })
    expect(result).toEqual([
      {
        avatar:
          "https://cdn.example.com/bucket/public/space/w1/publish-destinations/d1/abc",
        inboxId: "i1",
      },
      {
        avatar: "https://app.example/media/destination-avatar/d2",
        inboxId: "i2",
      },
      { avatar: null, inboxId: "i3" },
    ])
  })

  test("reads at most MAX_INBOX_AVATARS inboxes", async () => {
    mocks.list.mockResolvedValue([])
    const inboxIds = Array.from(
      { length: MAX_INBOX_AVATARS + 5 },
      (_, index) => `i${index}`,
    )

    await publishDestinationService.listInboxAvatars({
      inboxIds,
      workspaceId: "w1",
    })

    expect(mocks.list).toHaveBeenCalledWith({
      inboxIds: inboxIds.slice(0, MAX_INBOX_AVATARS),
      workspaceId: "w1",
    })
  })
})
