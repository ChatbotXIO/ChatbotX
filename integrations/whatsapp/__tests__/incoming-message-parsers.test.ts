import {
  decodeButtonPayload,
  encodeButtonPayload,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"
import {
  clampText,
  messageLimits,
} from "../src/handlers/message/message-limits"
import { logger } from "../src/lib/logger"

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const MEDIA_URL = "https://cdn.example.com/media"
/** Kept out of any `image/*` range so `fetchMedia`'s `imageSize` branch never
 * runs here — dimension extraction is untouched by this change. */
const MEDIA_MIME_TYPE = "application/octet-stream"

vi.mock("../src/client", () => ({
  getWhatsappClient: vi.fn(() => ({
    retrieveMedia: vi
      .fn()
      .mockResolvedValue({ url: MEDIA_URL, mime_type: MEDIA_MIME_TYPE }),
  })),
}))

vi.mock("cross-fetch", () => ({
  default: vi.fn().mockResolvedValue({
    ok: true,
    body: {},
    headers: { get: () => "10" },
    arrayBuffer: async () => new ArrayBuffer(8),
  }),
}))

const buildProps = (message: Record<string, unknown>) =>
  ({
    ctx: {
      auth: { tokens: { accessToken: "test-token" } },
      storagePrefix: "workspace-1",
    },
    data: {
      integrationType: "whatsapp",
      integrationIdentifier: "inbox-1",
      payload: {
        phoneID: "phone-1",
        from: "84900000001",
        name: "Alice",
        message: { id: "wamid.test-1", ...message },
      },
    },
  }) as never

beforeEach(() => {
  vi.mocked(logger.warn).mockClear()
})

describe("WhatsApp receiveMessage — text", () => {
  test("plain body becomes message text", async () => {
    const result = await receiveMessage(
      buildProps({ type: "text", text: { body: "hello there" } }),
    )

    expect(result.message?.text).toBe("hello there")
    expect(result.ref).toBeNull()
  })

  test("a /ref- prefixed body becomes a ref instead of text", async () => {
    const result = await receiveMessage(
      buildProps({ type: "text", text: { body: "/ref-xyz" } }),
    )

    expect(result.ref).toBe("xyz")
    expect(result.message?.text).toBeUndefined()
  })
})

describe("WhatsApp receiveMessage — media", () => {
  test("audio: attachment fileType audio, no text", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "audio",
        audio: { id: "media-audio-1", mime_type: "audio/ogg", voice: false },
      }),
    )

    expect(result.message?.attachments).toEqual([
      expect.objectContaining({ fileType: "audio", mimeType: "audio/ogg" }),
    ])
    expect(result.message?.text).toBeUndefined()
  })

  test("document: attachment fileType file, filename set, text is the caption", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "document",
        document: {
          id: "media-doc-1",
          mime_type: "application/pdf",
          filename: "invoice.pdf",
          caption: "Your invoice",
        },
      }),
    )

    expect(result.message?.attachments).toEqual([
      expect.objectContaining({
        fileType: "file",
        mimeType: "application/pdf",
        name: "invoice.pdf",
      }),
    ])
    expect(result.message?.text).toBe("Your invoice")
  })

  test("image: attachment fileType image, text is the caption", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "image",
        image: {
          id: "media-image-1",
          mime_type: "image/jpeg",
          caption: "Nice view",
        },
      }),
    )

    expect(result.message?.attachments).toEqual([
      expect.objectContaining({ fileType: "image", mimeType: "image/jpeg" }),
    ])
    expect(result.message?.text).toBe("Nice view")
  })

  test("sticker: attachment fileType image, no text", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "sticker",
        sticker: {
          id: "media-sticker-1",
          mime_type: "image/webp",
          animated: false,
        },
      }),
    )

    expect(result.message?.attachments).toEqual([
      expect.objectContaining({ fileType: "image", mimeType: "image/webp" }),
    ])
    expect(result.message?.text).toBeUndefined()
  })

  test("document/image with no caption: the text key is absent, not present-and-undefined", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "document",
        document: {
          id: "media-doc-2",
          mime_type: "application/pdf",
          filename: "invoice.pdf",
        },
      }),
    )

    // The refactor omits the `text` key when there is no caption, instead of
    // today's `message.text = undefined` (key present, value undefined).
    // Verified equivalent for every consumer (a truthiness check and a
    // Drizzle insert) — see plan §5.2.
    expect(result.message).not.toHaveProperty("text")
  })

  test("video: attachment fileType video, and a caption is NOT surfaced as text", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "video",
        video: {
          id: "media-video-1",
          mime_type: "video/mp4",
          caption: "Watch this",
        },
      }),
    )

    expect(result.message?.attachments).toEqual([
      expect.objectContaining({ fileType: "video", mimeType: "video/mp4" }),
    ])
    // Today's handler never reads video.caption — this pins that exact
    // behavior so a later refactor cannot silently start surfacing it.
    expect(result.message?.text).toBeUndefined()
  })
})

describe("WhatsApp receiveMessage — location / contacts / order", () => {
  test("location with name and address joins both into text", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "location",
        location: {
          latitude: "10.0",
          longitude: "20.0",
          name: "Office",
          address: "123 Main St",
        },
      }),
    )

    expect(result.message?.text).toBe("Office: 123 Main St")
    expect(result.message?.contentType).toBe("location")
  })

  test("location with neither name nor address falls back to a fixed label", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "location",
        location: { latitude: "10.0", longitude: "20.0" },
      }),
    )

    // Was a dead-code `""` before the refactor (plan §5.4) — `join` never
    // returns null/undefined, so `?? "Received location"` never fired. Fixed
    // as an owner-approved edge case (2026-07-31).
    expect(result.message?.text).toBe("Received location")
  })

  test("contacts sets a fixed text and carries the contacts payload", async () => {
    const contacts = [{ name: { formatted_name: "Jane Doe" } }]
    const result = await receiveMessage(
      buildProps({ type: "contacts", contacts }),
    )

    expect(result.message?.text).toBe("Received contacts")
    expect(result.message?.contentAttributes).toEqual({ contacts })
  })

  test("order carries the order payload as contentAttributes", async () => {
    const order = {
      catalog_id: "catalog-1",
      product_items: [{ product_retailer_id: "product-1" }],
    }
    const result = await receiveMessage(buildProps({ type: "order", order }))

    expect(result.message?.contentAttributes).toEqual(order)
  })
})

describe("WhatsApp receiveMessage — interactive replies", () => {
  test("button_reply sets postbackAction, text and buttonTitle from the id/title", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "flow-1:1:button-1", title: "Yes" },
        },
      }),
    )

    expect(result.postbackAction).toBe("flow-1:1:button-1")
    expect(result.message?.text).toBe("Yes")
    expect(result.buttonTitle).toBe("Yes")
  })

  test("list_reply sets postbackAction and carries the option as contentAttributes", async () => {
    const listReply = { id: "flow-1:1:option-1", title: "Option A" }
    const result = await receiveMessage(
      buildProps({
        type: "interactive",
        interactive: { type: "list_reply", list_reply: listReply },
      }),
    )

    expect(result.postbackAction).toBe("flow-1:1:option-1")
    expect(result.message?.contentAttributes).toEqual(listReply)
  })

  test("nfm_reply with a decodable flow token carrying a buttonId sets postbackAction", async () => {
    const flowToken = encodeButtonPayload({ flowId: "1", buttonId: "2" })
    const result = await receiveMessage(
      buildProps({
        type: "interactive",
        interactive: {
          type: "nfm_reply",
          nfm_reply: {
            name: "flow",
            body: "Sent",
            response_json: JSON.stringify({ flow_token: flowToken }),
          },
        },
      }),
    )

    expect(result.postbackAction).toBe(flowToken)
    expect(result.message?.contentAttributes).toMatchObject({
      type: "whatsapp_flow_response",
      flowToken,
    })
  })

  test("nfm_reply with an undecodable token still populates the flow response entity", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "interactive",
        interactive: {
          type: "nfm_reply",
          nfm_reply: {
            name: "flow",
            body: "Sent",
            response_json: JSON.stringify({ flow_token: "not-a-real-token" }),
          },
        },
      }),
    )

    expect(result.postbackAction).toBeNull()
    expect(result.message?.contentAttributes).toMatchObject({
      type: "whatsapp_flow_response",
      flowToken: "not-a-real-token",
    })
  })
})

describe("WhatsApp receiveMessage — unlisted message types", () => {
  test("an unlisted top-level type falls back to a fixed label", async () => {
    const result = await receiveMessage(
      buildProps({ type: "reaction", reaction: { message_id: "wamid.other" } }),
    )

    expect(result.message?.text).toBe("Received reaction")
  })
})

describe('WhatsApp receiveMessage — carousel/template button taps (type: "button")', () => {
  test("a payload carrying the encoded flow action becomes postbackAction — THE BUG FIX", async () => {
    // Captured from a live webhook (2026-07-30): tapping a carousel card's
    // quick-reply button arrives exactly like this — a top-level `type:
    // "button"` message, not `interactive.type: "button_reply"`.
    const payload = "11626340699193344:11629968082550784:11626632090058752"
    const result = await receiveMessage(
      buildProps({ type: "button", button: { text: "Button #1", payload } }),
    )

    expect(result.postbackAction).toBe(payload)
    expect(result.message?.text).toBe("Button #1")
    expect(result.buttonTitle).toBe("Button #1")
  })

  test("an absent payload leaves postbackAction null without throwing", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "button",
        button: { text: "Button #1", payload: undefined },
      }),
    )

    expect(result.postbackAction).toBeNull()
    expect(result.message?.text).toBe("Button #1")
  })

  test("a blank payload leaves postbackAction null without throwing", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "button",
        button: { text: "Button #1", payload: "" },
      }),
    )

    expect(result.postbackAction).toBeNull()
    expect(result.message?.text).toBe("Button #1")
  })
})

describe("WhatsApp receiveMessage — unhandled interactive reply types", () => {
  test("call_permission_reply falls back to a fixed label and logs a warning instead of silently dropping the tap", async () => {
    const result = await receiveMessage(
      buildProps({
        type: "interactive",
        interactive: {
          type: "call_permission_reply",
          call_permission_reply: {
            response: "accept",
            is_permanent: false,
            expiration_timestamp: 0,
            response_source: "user_action",
          },
        },
      }),
    )

    expect(result.message?.text).toBe("Received interactive (coming soon)")
    expect(result.postbackAction).toBeNull()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})

describe("WhatsApp receiveMessage — button payload round trip", () => {
  test("a button payload survives encode, the 256-char clamp and decode with the same buttonId", () => {
    const payload = clampText(
      encodeButtonPayload({
        flowId: "111",
        flowVersionId: "222",
        buttonId: "333",
      }),
      messageLimits.buttonId,
    )

    const decoded = decodeButtonPayload(payload)

    expect(decoded?.buttonId).toBe("333")
  })
})
