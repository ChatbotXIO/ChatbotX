import { describe, expect, it } from "vitest"
import { extractFromValue } from "../src/integration/handlers/coexist/whatsapp-history-payload"

// WhatsApp history: the message `type` is the sender's intent. An `image` is
// a photo (re-encoded in storage); an image sent as a `document` keeps its
// original bytes. Without the flag every imported image would be preserved
// and the storage savings for history would be nil.

const BUSINESS_PN = "15550001111"
const WA_ID = "601234567890"

const historyPayload = (
  messages: Record<string, unknown>[],
): Record<string, unknown> => ({
  messaging_product: "whatsapp",
  metadata: {
    phone_number_id: "123456789",
    display_phone_number: BUSINESS_PN,
  },
  history: [
    {
      metadata: { phase: 0, progress: 100, chunk_order: 1 },
      threads: [
        {
          id: WA_ID,
          context: { wa_id: WA_ID, user_id: "VN.4416742385309647" },
          messages,
        },
      ],
    },
  ],
})

describe("WhatsApp history photo intent", () => {
  it("marks an image message as a photo and a document image as an original", () => {
    const result = extractFromValue(
      historyPayload([
        {
          id: "wamid.photo",
          from: WA_ID,
          type: "image",
          image: { id: "media-photo", mime_type: "image/jpeg" },
          timestamp: "1779915326",
          history_context: { status: "delivered" },
        },
        {
          id: "wamid.scan",
          from: WA_ID,
          type: "document",
          document: {
            id: "media-scan",
            mime_type: "image/png",
            filename: "invoice.png",
          },
          timestamp: "1779915327",
          history_context: { status: "delivered" },
        },
      ]),
    )

    const attachments = result.entries.map(
      (entry) => entry.message.attachments?.[0],
    )
    expect(attachments.map((a) => a?.sourceId)).toEqual([
      "media-photo",
      "media-scan",
    ])
    expect(attachments.map((a) => a?.isPhotoMessage)).toEqual([true, false])
  })
})
