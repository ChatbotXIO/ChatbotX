import { unsubscribePageFromInstagramWebhook as unsubscribeInstagramLogin } from "@chatbotx.io/integration-instagram/apis/page"
import { unsubscribePageFromInstagramWebhook as unsubscribeFacebookLogin } from "@chatbotx.io/integration-instagram-facebook/apis/page"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  findIntegration: vi.fn(),
  disconnectChannel: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: {
    disconnectChannel: mocks.disconnectChannel,
    findByIdForWorkspace: mocks.findIntegration,
  },
  messengerIntegrationService: { existsForPage: vi.fn(async () => false) },
  workspaceService: { findById: vi.fn(async () => ({ ownerId: "owner-1" })) },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: vi.fn() },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))
vi.mock("@/integration", () => ({
  integrations: {
    instagram: { disconnect: mocks.disconnect },
    instagramFacebook: { disconnect: mocks.disconnect },
  },
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn() } }))

const { disconnectInstagram } = await import(
  "@/features/integration-instagram/actions/disconnect-instagram"
)

const run = () =>
  disconnectInstagram({
    workspaceId: "workspace-1",
    integrationInstagramId: "integration-1",
  })

type MetaError = { code: number; message: string }

const LOGINS = [
  {
    type: "facebook",
    url: "https://graph.facebook.com/:version/page-1/subscribed_apps",
    unsubscribe: () =>
      unsubscribeFacebookLogin({
        pageId: "page-1",
        appAccessToken: "client-1|secret",
      }),
  },
  {
    type: "instagram",
    url: "https://graph.instagram.com/:version/page-1/subscribed_apps",
    unsubscribe: () =>
      unsubscribeInstagramLogin({ igId: "page-1", accessToken: "token" }),
  },
]

describe.each(
  LOGINS,
)("disconnectInstagram ($type login) when the unsubscribe fails", (login) => {
  // Builder tests have no shared MSW setup: listen here, and never reach Meta.
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findIntegration.mockResolvedValue({
      id: "integration-1",
      inboxId: "inbox-1",
      type: login.type,
      auth: { clientId: "client-1", metadata: { pageId: "page-1" } },
    })
  })

  const metaRejects = (error: MetaError) => {
    server.use(
      http.delete(login.url, () =>
        HttpResponse.json({ error }, { status: 400 }),
      ),
    )
    mocks.disconnect.mockImplementation(login.unsubscribe)
  }

  test("removes the channel when the app is no longer installed", async () => {
    metaRejects({
      code: 100,
      message: "(#100) App is not installed: 123",
    })

    await run()

    expect(mocks.disconnectChannel).toHaveBeenCalledTimes(1)
  })

  test("keeps the channel and surfaces a rate limit", async () => {
    metaRejects({ code: 4, message: "(#4) Application request limit reached" })

    await expect(run()).rejects.toThrow("request limit")
    expect(mocks.disconnectChannel).not.toHaveBeenCalled()
  })
})
