// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMessenger: vi.fn(),
  findInstagram: vi.fn(),
  findWhatsapp: vi.fn(),
  findWorkspace: vi.fn(),
  resolveForOwner: vi.fn(),
  resolveOwnerForWorkspace: vi.fn(),
  resolveProviderOrigin: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND")
  }),
}))

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }))
vi.mock("@/features/integration-messenger/queries", () => ({
  findIntegrationMessenger: mocks.findMessenger,
}))
vi.mock("@/features/integration-instagram/queries", () => ({
  findIntegrationInstagram: mocks.findInstagram,
}))
// Only the services these pages are allowed to use exist on the mock: touching
// `metaConversionsService` (a live scope refresh) would throw.
vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: { findByIdForWorkspace: mocks.findWhatsapp },
  platformCredentialService: { resolveForOwner: mocks.resolveForOwner },
  workspaceService: { findById: mocks.findWorkspace },
}))
vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: mocks.resolveOwnerForWorkspace,
}))
vi.mock("@/lib/provider-origin", () => ({
  resolveProviderOriginForCredential: mocks.resolveProviderOrigin,
}))
vi.mock(
  "@/features/integration-messenger/components/messenger-capi-tab",
  () => ({
    MessengerCapiTab: () => null,
  }),
)
vi.mock(
  "@/features/integration-instagram/components/instagram-capi-tab",
  () => ({
    InstagramCapiTab: () => null,
  }),
)
vi.mock("@/features/integration-whatsapp/components/whatsapp-capi-tab", () => ({
  WhatsappCapiTab: () => null,
}))

const { default: MessengerAdsPage } = await import(
  "../src/app/space/[workspaceId]/messengers/[id]/ads/page"
)
const { default: InstagramAdsPage } = await import(
  "../src/app/space/[workspaceId]/instagrams/[id]/ads/page"
)
const { default: WhatsappAdsPage } = await import(
  "../src/app/space/[workspaceId]/(integrations)/whatsapps/[id]/ads/page"
)

const params = (id = "7") => ({
  params: Promise.resolve({ workspaceId: "100", id }),
})
const CIPHERTEXT = { iv: "SECRET-IV", content: "SECRET-CONTENT" }
const propsOf = (element: unknown) =>
  (element as { props: Record<string, unknown> }).props

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveOwnerForWorkspace.mockResolvedValue("owner-1")
  mocks.findWorkspace.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
})

describe("Messenger Ads page", () => {
  const row = {
    id: "7",
    datasetId: "ds-1",
    capiTestEventCode: "T1",
    hasCapiScope: false,
    capiDisconnectedAt: null,
    capiAccessToken: CIPHERTEXT,
    auth: { tokens: { accessToken: "page-token" } },
  }

  test("derives the connection on the server and hands the tab only plain fields", async () => {
    mocks.findMessenger.mockResolvedValue(row)

    const props = propsOf(await MessengerAdsPage(params()))

    expect(props).toEqual({
      connection: "connected",
      integrationMessenger: {
        id: "7",
        datasetId: "ds-1",
        capiTestEventCode: "T1",
      },
    })
    expect(JSON.stringify(props)).not.toContain("SECRET")
    expect(JSON.stringify(props)).not.toContain("page-token")
  })

  test("a disconnected integration reads as not connected whatever it stores", async () => {
    mocks.findMessenger.mockResolvedValue({
      ...row,
      capiDisconnectedAt: new Date("2026-10-01T00:00:00.000Z"),
    })

    expect(propsOf(await MessengerAdsPage(params())).connection).toBe(
      "notConnected",
    )
  })

  test("rejects a malformed route", async () => {
    await expect(
      MessengerAdsPage({
        params: Promise.resolve({ workspaceId: "100", id: "not-a-number" }),
      }),
    ).rejects.toThrow("NOT_FOUND")
  })
})

describe("Instagram Ads page", () => {
  const row = {
    id: "9",
    type: "facebook",
    datasetId: "ds-2",
    capiTestEventCode: null,
    hasCapiScope: true,
    capiDisconnectedAt: null,
    capiAccessToken: null,
  }

  test("keeps a legacy row with its dataset and stored scope connected", async () => {
    mocks.findInstagram.mockResolvedValue(row)

    expect(propsOf(await InstagramAdsPage(params("9")))).toEqual({
      connection: "connected",
      integrationInstagram: {
        id: "9",
        type: "facebook",
        datasetId: "ds-2",
        capiTestEventCode: null,
      },
    })
  })

  test("passes the account type through so the tab can mark Business Login unsupported", async () => {
    mocks.findInstagram.mockResolvedValue({ ...row, type: "instagram" })

    expect(
      (
        propsOf(await InstagramAdsPage(params("9"))).integrationInstagram as {
          type: string
        }
      ).type,
    ).toBe("instagram")
  })
})

describe("WhatsApp Ads page", () => {
  const row = {
    id: "3",
    datasetId: "ds-3",
    capiTestEventCode: null,
    hasCapiScope: false,
    capiDisconnectedAt: null,
    capiAccessToken: null,
    isCoexist: true,
  }
  const publicConfig = { clientId: "app-1", capiConfigId: "capi" }

  beforeEach(() => {
    mocks.resolveForOwner.mockResolvedValue({ publicConfig })
    mocks.resolveProviderOrigin.mockResolvedValue("https://broker.example.test")
  })

  test("builds the popup inputs for the tab and keeps a dataset-only row connected", async () => {
    mocks.findWhatsapp.mockResolvedValue(row)

    const props = propsOf(await WhatsappAdsPage(params("3")))

    expect(props).toEqual({
      connection: "connected",
      integrationWhatsapp: {
        id: "3",
        datasetId: "ds-3",
        capiTestEventCode: null,
        isCoexist: true,
      },
      settings: publicConfig,
      oauthCallbackUrl:
        "https://broker.example.test/integrations/whatsapp/callback",
    })
    expect(mocks.resolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "whatsapp",
    })
  })

  test("still renders when the platform has no WhatsApp app: the tab explains it on click", async () => {
    mocks.findWhatsapp.mockResolvedValue(row)
    mocks.resolveForOwner.mockResolvedValue(null)

    expect(propsOf(await WhatsappAdsPage(params("3"))).settings).toBeNull()
  })

  test("a missing integration is a 404", async () => {
    mocks.findWhatsapp.mockResolvedValue(null)

    await expect(WhatsappAdsPage(params("3"))).rejects.toThrow("NOT_FOUND")
  })
})
