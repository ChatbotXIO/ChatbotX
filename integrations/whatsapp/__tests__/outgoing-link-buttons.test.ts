import { decodeButtonPayload, getButtonLinkUrl } from "@chatbotx.io/flow-config"
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
const MAGIC_LINK_URL = "https://app.example.com/r/workspace-1/promo"

const ctx = {
  auth: { metadata: { phoneNumber: { id: PHONE_NUMBER_ID } } },
} as never

// `decodeButtonPayload` requires `contactInboxId` to be strictly numeric, so
// this stays a bigint-shaped id rather than the "contact-1" style used by
// mocks that never round-trip the code through decode.
const CONTACT_INBOX_ID = "1000000000030"
const contact = { id: CONTACT_INBOX_ID, sourceId: "84123456789" } as never

const makeButton = (index: number, label = `Button ${index}`) => ({
  id: `${1_000_000_000_010 + index}`,
  label,
  buttonType: null,
  beforeStep: null,
  steps: [],
})

const makeButtons = (count: number) =>
  Array.from({ length: count }, (_, index) => makeButton(index))

const makeLinkButton = (index: number, label: string, url: string) => ({
  id: `${1_000_000_000_020 + index}`,
  label,
  buttonType: "openWebsite",
  beforeStep: {
    id: `${1_000_000_000_020 + index}-open`,
    stepType: "openWebsite",
    url,
    browserSize: 100,
  },
  steps: [],
})

const sendStep = (step: Record<string, unknown>) =>
  sendFlowStep({
    ctx,
    data: { contact, flowId: FLOW_ID, flowVersionId: FLOW_VERSION_ID, step },
  } as never)

const sendTextStep = (buttons: Record<string, unknown>[], text = "Pick one") =>
  sendStep({
    id: "text-1",
    stepType: "sendText",
    text,
    buttons,
  })

const sendImageStep = (buttons: Record<string, unknown>[]) =>
  sendStep({
    id: "image-1",
    stepType: "sendImage",
    mode: "file",
    url: IMAGE_URL,
    buttons,
  })

const messageAt = (index: number) =>
  mockSendMessage.mock.calls[index]?.[2] as Record<string, unknown>

const lastMessage = () =>
  mockSendMessage.mock.lastCall?.[2] as Record<string, unknown>

describe("getButtonLinkUrl", () => {
  const baseButton = {
    id: "1000000000010",
    label: "Button",
    steps: [] as never[],
  }

  test("returns the url for an openWebsite button", () => {
    const button = {
      ...baseButton,
      buttonType: "openWebsite" as const,
      beforeStep: {
        id: "1000000000011",
        stepType: "openWebsite" as const,
        url: "https://example.com/promo",
        browserSize: 100 as const,
      },
    }

    expect(getButtonLinkUrl(button as never)).toBe("https://example.com/promo")
  })

  test("returns undefined for every other buttonType", () => {
    const nonLinkButtonTypes = [
      null,
      "sendMessage",
      "performAction",
      "startExternalFlow",
      "startExternalNode",
      "startAnotherNode",
      "whatsappOptionList",
    ] as const

    for (const buttonType of nonLinkButtonTypes) {
      const button = { ...baseButton, buttonType, beforeStep: null }
      expect(getButtonLinkUrl(button as never)).toBeUndefined()
    }
  })
})

describe("whatsapp link button messages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.provider-1" }],
    })
  })

  test("sends a single openWebsite button as a cta_url message with the magic link", async () => {
    await sendTextStep([makeLinkButton(0, "Visit us", MAGIC_LINK_URL)])

    expect(mockSendMessage).toHaveBeenCalledOnce()
    const message = lastMessage()
    expect(message).toMatchObject({
      _type: "interactive",
      type: "cta_url",
      body: { text: "Pick one" },
    })

    const action = message.action as {
      name: string
      parameters: { display_text: string; url: string }
    }
    expect(action.name).toBe("cta_url")
    expect(action.parameters.display_text).toBe("Visit us")

    const url = new URL(action.parameters.url)
    expect(url.origin + url.pathname).toBe(MAGIC_LINK_URL)
    // The redirect route (`apps/builder/src/app/r/[workspaceId]/[name]/route.ts`)
    // rejects a code with no `contactInboxId` segment, so a link button's code
    // must carry the contact inbox id the same way the carousel's does.
    expect(url.searchParams.get("code")).toBe(
      `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000020:::${CONTACT_INBOX_ID}`,
    )
  })

  test("encodes the contact inbox id into the cta_url magic-link code so the redirect route can resolve it", async () => {
    await sendTextStep([makeLinkButton(0, "Visit us", MAGIC_LINK_URL)])

    const action = lastMessage().action as {
      parameters: { url: string }
    }
    const code = new URL(action.parameters.url).searchParams.get("code")
    const decoded = decodeButtonPayload(code ?? "")

    expect(decoded?.contactInboxId).toBe(CONTACT_INBOX_ID)
  })

  // `whatsapp-api-js`'s `Interactive` constructor throws unless a `cta_url`
  // header is text, so an image can never be the cta_url message's header —
  // it is sent as its own message immediately ahead of it instead, the same
  // way an image is sent ahead of a reply list past three buttons.
  test("sends the image as its own message ahead of the cta_url message", async () => {
    await sendImageStep([makeLinkButton(0, "Visit us", MAGIC_LINK_URL)])

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect(messageAt(0)).toMatchObject({ _type: "image", link: IMAGE_URL })
    expect(messageAt(1)).toMatchObject({ type: "cta_url" })
  })

  test("emits both a reply interactive and a cta_url message when link and reply buttons are mixed", async () => {
    await sendTextStep([
      makeButton(0, "Reply"),
      makeLinkButton(0, "Visit us", MAGIC_LINK_URL),
    ])

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect(messageAt(0)).toMatchObject({
      type: "button",
      body: { text: "Pick one" },
    })
    expect(messageAt(1)).toMatchObject({ type: "cta_url" })

    const replyAction = messageAt(0).action as { buttons: unknown[] }
    expect(replyAction.buttons).toHaveLength(1)
  })

  test("sends multiple link buttons as multiple cta_url messages", async () => {
    await sendTextStep([
      makeLinkButton(0, "First", MAGIC_LINK_URL),
      makeLinkButton(1, "Second", MAGIC_LINK_URL),
    ])

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect(messageAt(0)).toMatchObject({
      type: "cta_url",
      body: { text: "Pick one" },
    })
    expect(messageAt(1)).toMatchObject({ type: "cta_url" })

    const firstAction = messageAt(0).action as {
      parameters: { display_text: string }
    }
    const secondAction = messageAt(1).action as {
      parameters: { display_text: string }
    }
    expect(firstAction.parameters.display_text).toBe("First")
    expect(secondAction.parameters.display_text).toBe("Second")
  })

  test("falls back to the placeholder body when there is no text", async () => {
    await sendImageStep([makeLinkButton(0, "Visit us", MAGIC_LINK_URL)])

    expect(lastMessage()).toMatchObject({ body: { text: "." } })
  })

  test("clamps a link button label longer than 20 characters", async () => {
    await sendTextStep([makeLinkButton(0, "L".repeat(30), MAGIC_LINK_URL)])

    const action = lastMessage().action as {
      parameters: { display_text: string }
    }
    expect(action.parameters.display_text).toHaveLength(20)
  })

  test("regression: a reply-only step still renders reply buttons, not a cta_url message", async () => {
    await sendTextStep(makeButtons(3))

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(lastMessage()).toMatchObject({ type: "button" })
  })

  test("regression: more than three reply-only buttons still render a list", async () => {
    await sendTextStep(makeButtons(4))

    expect(lastMessage()).toMatchObject({ type: "list" })
  })
})
