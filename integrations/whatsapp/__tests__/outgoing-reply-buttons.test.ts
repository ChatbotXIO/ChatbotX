import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockGetWhatsappClient, mockSendMessage, mockLogger } = vi.hoisted(
  () => {
    const sendMessage = vi.fn()
    return {
      mockGetWhatsappClient: vi.fn(() => ({ sendMessage })),
      mockSendMessage: sendMessage,
      mockLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    }
  },
)

vi.mock("../src/client", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

vi.mock("../src/lib/logger", () => ({
  logger: mockLogger,
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const FLOW_ID = "1000000000001"
const FLOW_VERSION_ID = "1000000000002"
const PHONE_NUMBER_ID = "pn-1"
const IMAGE_URL = "https://example.com/photo.png"

const ctx = {
  auth: { metadata: { phoneNumber: { id: PHONE_NUMBER_ID } } },
} as never

const contact = { id: "contact-1", sourceId: "84123456789" } as never

const makeButton = (index: number, label = `Button ${index}`) => ({
  id: `${1_000_000_000_010 + index}`,
  label,
  buttonType: null,
  beforeStep: null,
  steps: [],
})

const makeButtons = (count: number) =>
  Array.from({ length: count }, (_, index) => makeButton(index))

const sendStep = (step: Record<string, unknown>) =>
  sendFlowStep({
    ctx,
    data: { contact, flowId: FLOW_ID, flowVersionId: FLOW_VERSION_ID, step },
  } as never)

const sendTextStep = (buttons: ReturnType<typeof makeButton>[]) =>
  sendStep({
    id: "text-1",
    stepType: "sendText",
    text: "Pick one",
    buttons,
  })

const sendImageStep = (buttons: ReturnType<typeof makeButton>[]) =>
  sendStep({
    id: "image-1",
    stepType: "sendImage",
    mode: "file",
    url: IMAGE_URL,
    buttons,
  })

const lastMessage = () =>
  mockSendMessage.mock.lastCall?.[2] as Record<string, unknown>

describe("whatsapp reply button selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.provider-1" }],
    })
  })

  test("renders up to three buttons of a text step as reply buttons", async () => {
    await sendTextStep(makeButtons(3))

    expect(lastMessage()).toMatchObject({
      _type: "interactive",
      type: "button",
      body: { text: "Pick one" },
    })
  })

  test("switches a text step to a list once it has more than three buttons", async () => {
    await sendTextStep(makeButtons(4))

    const message = lastMessage()
    expect(message).toMatchObject({ type: "list" })
    expect(
      (message.action as { sections: { rows: unknown[] }[] }).sections[0].rows,
    ).toHaveLength(4)
  })

  test("spreads a text step over extra lists instead of dropping buttons", async () => {
    await sendTextStep(makeButtons(12))

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    const rowsOf = (index: number) =>
      (
        mockSendMessage.mock.calls[index][2] as {
          action: { sections: { rows: { title: string }[] }[] }
        }
      ).action.sections[0].rows

    expect(rowsOf(0)).toHaveLength(10)
    expect(rowsOf(1).map((row) => row.title)).toEqual([
      "Button 10",
      "Button 11",
    ])
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test("sends an image step's photo separately once buttons need a list", async () => {
    await sendImageStep(makeButtons(5))

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    const [image, list] = mockSendMessage.mock.calls.map(
      (call) => call[2] as Record<string, unknown>,
    )

    expect(image).toMatchObject({ _type: "image", link: IMAGE_URL })
    expect(list).toMatchObject({ type: "list" })
    expect(
      (list.action as { sections: { rows: unknown[] }[] }).sections[0].rows,
    ).toHaveLength(5)
  })

  test("keeps an image step's photo inline while three buttons still fit", async () => {
    await sendImageStep(makeButtons(3))

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(lastMessage()).toMatchObject({
      type: "button",
      header: { type: "image", image: { link: IMAGE_URL } },
    })
  })

  test("sends a bare image when an image step has no buttons", async () => {
    await sendImageStep([])

    expect(lastMessage()).toMatchObject({ _type: "image", link: IMAGE_URL })
  })

  test("clamps list row titles to the documented limit", async () => {
    await sendTextStep([
      ...makeButtons(3),
      makeButton(3, `${"R".repeat(30)} tail`),
    ])

    const rows = (
      lastMessage().action as { sections: { rows: { title: string }[] }[] }
    ).sections[0].rows

    expect(rows[3].title).toBe("R".repeat(24))
  })
})
