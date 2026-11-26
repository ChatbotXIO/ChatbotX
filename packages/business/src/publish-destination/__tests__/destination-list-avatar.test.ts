import { beforeEach, describe, expect, test, vi } from "vitest"
import { toPublishDestinationDto } from "../dto"
import { publishDestinationService } from "../service"

const mocks = vi.hoisted(() => ({
  buildUrls: vi.fn(),
  enqueueRefresh: vi.fn(async () => 0),
  ensureForInboxes: vi.fn(async () => []),
  list: vi.fn(),
  listConnectedInboxes: vi.fn(async () => ({ rows: [], truncated: false })),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  MAX_PUBLISH_INBOXES_PER_PROVIDER: 200,
  publishDestinationRepository: {
    ensureForInboxes: mocks.ensureForInboxes,
    listConnectedInboxes: mocks.listConnectedInboxes,
  },
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
vi.mock("../avatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../avatar")>()),
  publishDestinationAvatarService: { enqueueRefresh: mocks.enqueueRefresh },
}))
vi.mock("../../base.service", () => ({ BaseService: class {} }))

const DAY = 24 * 60 * 60 * 1000

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

describe("publishDestinationService.list avatar", () => {
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

  test("no longer enqueues refresh jobs on list", async () => {
    mocks.list.mockResolvedValue([row(1), row(2)])

    await publishDestinationService.list({ workspaceId: "w1" })

    expect(mocks.enqueueRefresh).not.toHaveBeenCalled()
  })

  test("gives a missing picture the on-view route URL, only for fetchable rows", async () => {
    mocks.list.mockResolvedValue([
      row(1),
      row(2, { avatarFetchedAt: new Date(Date.now() - 8 * DAY) }),
      row(3, { avatarFetchedAt: new Date() }),
      row(4, { inboxId: null, provider: "tiktok" }),
      row(5, { state: "inboxDisconnected" }),
      row(6, { state: "needsReconnect" }),
    ])

    const { destinations } = await publishDestinationService.list({
      workspaceId: "w1",
    })

    expect(destinations.map((destination) => destination.avatar)).toEqual([
      "https://app.example/media/destination-avatar/d1",
      "https://app.example/media/destination-avatar/d2",
      null,
      null,
      null,
      null,
    ])
    expect(mocks.buildUrls).toHaveBeenCalledWith({
      publishDestinationIds: ["d1", "d2"],
      workspaceId: "w1",
    })
  })

  test("returns the avatar as a public URL, null when none", async () => {
    mocks.list.mockResolvedValue([
      row(1, {
        avatar: "public/space/w1/publish-destinations/d1/abc",
        avatarFetchedAt: new Date(),
      }),
      row(2, { avatarFetchedAt: new Date() }),
    ])
    mocks.buildUrls.mockResolvedValue(new Map())

    const { destinations } = await publishDestinationService.list({
      workspaceId: "w1",
    })

    expect(destinations.map((destination) => destination.avatar)).toEqual([
      "https://cdn.example.com/bucket/public/space/w1/publish-destinations/d1/abc",
      null,
    ])
  })
})

describe("toPublishDestinationDto avatar", () => {
  test("keeps TikTok's absolute URL and never exposes the fetch time", () => {
    const dto = toPublishDestinationDto(
      row(1, { avatar: "https://p16.tiktokcdn.com/a.jpg" }) as never,
      "https://cdn.example.com/bucket/",
    )

    expect(dto.avatar).toBe("https://p16.tiktokcdn.com/a.jpg")
    expect(dto).not.toHaveProperty("avatarFetchedAt")
  })
})

describe("toPublishDestinationDto pause", () => {
  const now = new Date("2026-01-01T12:00:00Z")

  test("shows a pause that is still running, with its reason", () => {
    const pausedUntil = new Date(now.getTime() + 3_600_000)
    const dto = toPublishDestinationDto(
      row(1, { pausedUntil, pauseReason: "limitReached" }) as never,
      "https://cdn.example.com/bucket/",
      null,
      now,
    )

    expect(dto.pausedUntil).toEqual(pausedUntil)
    expect(dto.pauseReason).toBe("limitReached")
  })

  test("a pause that is over has no effect and is not shown", () => {
    const dto = toPublishDestinationDto(
      row(1, {
        pausedUntil: new Date(now.getTime() - 1000),
        pauseReason: "limitReached",
      }) as never,
      "https://cdn.example.com/bucket/",
      null,
      now,
    )

    expect(dto.pausedUntil).toBeNull()
    expect(dto.pauseReason).toBeNull()
  })
})
