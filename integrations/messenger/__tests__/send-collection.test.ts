import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendPageMessage } = vi.hoisted(() => ({
  mockSendPageMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({ sendMessage: mockSendPageMessage }))
vi.mock("../src/apis/comment", () => ({ sendPrivateReplyMessage: vi.fn() }))
vi.mock("../src/apis/page", () => ({
  ensureMessengerWhitelistedDomain: vi.fn(),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: {
    tokens: { accessToken: "tok" },
    version: "v20.0",
    metadata: { pageId: "page-1" },
  },
  platform: { appUrl: "https://app.example.test" },
  integrationDetail: { personaId: undefined },
} as never

const contact = {
  id: "contact-1",
  sourceId: "psid-1",
  lastIncomingMessageAt: new Date(Date.now() - 60 * 1000),
} as never

const card = (id: string) => ({
  id,
  stepType: "sendCard",
  title: `Product ${id}`,
  subtitle: "$15.00",
  image: {
    id: `img-${id}`,
    stepType: "sendImage",
    mode: "url",
    url: `https://img.example/${id}.jpg`,
    buttons: [],
  },
  buttons: [
    {
      id: `btn-${id}`,
      label: "View",
      buttonType: "openWebsite",
      beforeStep: {
        id: `open-${id}`,
        stepType: "openWebsite",
        url: `https://app.example.test/shop/ws/products/${id}?token=signed`,
        browserSize: 100,
      },
      steps: [],
    },
  ],
})

const collection = (cards: unknown[]) => ({
  id: "step-1",
  nodeId: "node-1",
  stepType: "sendCollection",
  dataType: "products",
  collectionType: "automated",
  conditions: {
    name: "",
    categoryId: null,
    subcategoryId: null,
    vendorId: null,
  },
  productIds: [],
  cards,
})

describe("messenger sendFlowStep — product collection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m-1",
    })
  })

  test("sends the resolved cards as one generic-template carousel", async () => {
    await sendFlowStep({
      ctx,
      data: { contact, step: collection([card("p1"), card("p2")]) },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0] as [
      unknown,
      {
        message: {
          attachment: {
            payload: {
              template_type: string
              elements: Array<{
                title: string
                buttons: Array<{ type: string; url: string }>
              }>
            }
          }
        }
      },
    ]
    const template = payload.message.attachment.payload
    expect(template.template_type).toBe("generic")
    expect(template.elements.map((element) => element.title)).toEqual([
      "Product p1",
      "Product p2",
    ])
    expect(template.elements[0]?.buttons[0]).toMatchObject({
      type: "web_url",
    })
  })

  test("sends nothing for a collection without cards", async () => {
    await sendFlowStep({
      ctx,
      data: { contact, step: collection([]) },
    } as never)
    expect(mockSendPageMessage).not.toHaveBeenCalled()
  })
})
