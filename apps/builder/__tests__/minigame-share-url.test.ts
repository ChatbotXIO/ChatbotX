// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindWithIntegrationsById, mockResolveTenantSettings } = vi.hoisted(
  () => ({
    mockFindWithIntegrationsById: vi.fn(),
    mockResolveTenantSettings: vi.fn(async () => ({
      appUrl: "https://app.example.com",
    })),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  inboxService: { findWithIntegrationsById: mockFindWithIntegrationsById },
  resolveTenantSettings: mockResolveTenantSettings,
}))

const { buildMinigameShareUrl } = await import(
  "@/features/minigames/lib/minigame-share"
)

const MINIGAME_ID = "11674826046652416"
const REFERRER_CONTACT_ID = "11597088455065600"
// `mg_<base62 minigameId>_<base62 referrerContactId>` — 22 chars for
// snowflake ids, comfortably inside Telegram's 64-char `start` limit.
const EXPECTED_REF = "mg_rTBrIEY0e_r77FEQU8e"

const minigame = (playerSettings: Record<string, unknown>) =>
  ({
    id: MINIGAME_ID,
    workspaceId: "workspace-1",
    playerSettings,
  }) as never

const configured = { sharingFlowId: "flow-1", sharingNodeId: "node-1" }

const contactInbox = (channel: string) =>
  ({ id: "contact-inbox-1", inboxId: "inbox-1", channel }) as never

const inbox = (channel: string, overrides: Record<string, unknown> = {}) => ({
  id: "inbox-1",
  workspaceId: "workspace-1",
  name: "my_bot",
  sourceId: "110299060643206",
  channel,
  ...overrides,
})

const build = (props: {
  playerSettings?: Record<string, unknown>
  channel?: string | null
}) =>
  buildMinigameShareUrl({
    minigame: minigame(props.playerSettings ?? configured),
    contactId: REFERRER_CONTACT_ID,
    contactInbox:
      props.channel === null
        ? undefined
        : contactInbox(props.channel ?? "messenger"),
  })

describe("buildMinigameShareUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveTenantSettings.mockResolvedValue({
      appUrl: "https://app.example.com",
    })
  })

  test("builds a ref link for the channel the player is playing on", async () => {
    mockFindWithIntegrationsById.mockResolvedValue(inbox("messenger"))

    await expect(build({})).resolves.toBe(
      `https://m.me/110299060643206?ref=${EXPECTED_REF}`,
    )
  })

  test("uses each channel's own ref parameter", async () => {
    mockFindWithIntegrationsById.mockResolvedValue(inbox("telegram"))
    await expect(build({ channel: "telegram" })).resolves.toBe(
      `https://t.me/my_bot?start=${EXPECTED_REF}`,
    )

    mockFindWithIntegrationsById.mockResolvedValue(
      inbox("whatsapp", {
        integrationWhatsapp: { displayPhoneNumber: "84900000000" },
      }),
    )
    await expect(build({ channel: "whatsapp" })).resolves.toBe(
      `https://wa.me/84900000000?text=%2Fref-${EXPECTED_REF}`,
    )
  })

  // The Sharing Node is the only switch for the Share button.
  test("returns null when no sharing node is configured", async () => {
    await expect(build({ playerSettings: {} })).resolves.toBeNull()
    await expect(
      build({ playerSettings: { sharingFlowId: null, sharingNodeId: null } }),
    ).resolves.toBeNull()
    expect(mockFindWithIntegrationsById).not.toHaveBeenCalled()
  })

  test("returns null when the player has no contact inbox", async () => {
    await expect(build({ channel: null })).resolves.toBeNull()
    expect(mockFindWithIntegrationsById).not.toHaveBeenCalled()
  })

  // Zalo and TikTok build a link that looks right but drop the ref on the way
  // in, so the button would silently never credit anyone.
  test.each([
    "zalo",
    "tiktok",
    "smtp",
  ])("returns null on %s, which cannot receive a ref", async (channel) => {
    await expect(build({ channel })).resolves.toBeNull()
    expect(mockFindWithIntegrationsById).not.toHaveBeenCalled()
  })

  // Webchat *can* receive a ref, but every private-window visitor is a fresh
  // Contact, and the only thing standing between a sharer and their own cap
  // is the `referrerContactId !== contactId` guard — so the link would be
  // self-farmable. Reflinks and QR codes keep webchat; they pay no bonus.
  test("returns null on webchat, whose visitors make the link self-farmable", async () => {
    await expect(build({ channel: "webchat" })).resolves.toBeNull()
    expect(mockFindWithIntegrationsById).not.toHaveBeenCalled()
  })

  test("returns null when the inbox belongs to another workspace", async () => {
    mockFindWithIntegrationsById.mockResolvedValue(
      inbox("messenger", { workspaceId: "workspace-2" }),
    )

    await expect(build({})).resolves.toBeNull()
  })

  test("returns null when the inbox no longer exists", async () => {
    mockFindWithIntegrationsById.mockResolvedValue(undefined)

    await expect(build({})).resolves.toBeNull()
  })
})
