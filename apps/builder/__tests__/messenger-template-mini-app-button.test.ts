// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findOrFail: vi.fn(),
  createPageMessageTemplate: vi.fn(),
  findIdBySourceId: vi.fn(),
}))

vi.mock("@chatbotx.io/business/mini-app", () => ({
  miniAppService: { findOrFail: mocks.findOrFail },
}))
vi.mock("@chatbotx.io/business", () => ({
  assertPublicUrl: vi.fn(),
  buildContext: vi.fn(),
  messengerMessageTemplateService: {
    findIdBySourceId: mocks.findIdBySourceId,
  },
}))
vi.mock("@chatbotx.io/integration-messenger/apis/message-templates", () => ({
  createPageMessageTemplate: mocks.createPageMessageTemplate,
}))
vi.mock("@chatbotx.io/integration-messenger/apis/upload", () => ({
  resumableUploadImage: vi.fn(),
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))
// The created template is synced back from Meta through the integration.
vi.mock("@/integration", () => ({
  integrations: { messenger: { syncMessageTemplates: vi.fn() } },
}))
vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => "https://app.example.com",
}))

const { buildMessengerMessageTemplateComponents } = await import(
  "@/features/integration-messenger/message-templates/lib/build-template-components"
)
const { createMessengerMessageTemplateRequest } = await import(
  "@/features/integration-messenger/message-templates/schema/mutation"
)
const { createMessengerMessageTemplate } = await import(
  "@/features/integration-messenger/message-templates/lib/message-template-operations"
)

const request = createMessengerMessageTemplateRequest.parse({
  name: "form_invite",
  language: "vi",
  headerType: "none",
  body: "Please fill the form",
  buttons: [{ type: "MINI_APP", title: "Fill form", miniAppId: "42" }],
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Messenger template MINI_APP button", () => {
  test("is saved on Meta as a URL button to the Mini App with a token suffix", () => {
    const components = buildMessengerMessageTemplateComponents(request)

    expect(components.at(-1)).toEqual({
      type: "BUTTONS",
      buttons: [
        {
          type: "URL",
          text: "Fill form",
          url: "https://app.example.com/mini-apps?id=42&token={{1}}",
          example: {
            url_suffix_example:
              "https://app.example.com/mini-apps?id=42&token=example-token",
          },
        },
      ],
    })
  })

  test("needs a Mini App id", () => {
    expect(
      createMessengerMessageTemplateRequest.safeParse({
        name: "form_invite",
        language: "vi",
        headerType: "none",
        body: "Hi",
        buttons: [{ type: "MINI_APP", title: "Fill form", miniAppId: "" }],
      }).success,
    ).toBe(false)
  })

  test("a Mini App of another workspace is refused before anything reaches Meta", async () => {
    mocks.findOrFail.mockRejectedValue(
      Object.assign(new Error("Mini App not found"), { code: "notFound" }),
    )

    await expect(
      createMessengerMessageTemplate({
        workspaceId: "ws-1",
        integrationMessenger: { id: "im-1", auth: {} } as never,
        request,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.findOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "42",
    })
    expect(mocks.createPageMessageTemplate).not.toHaveBeenCalled()
  })
})
