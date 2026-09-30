import { createHmac } from "node:crypto"

// Shared fixtures for the conversation-routing tests.

export const PHONE_ID = "phone-1"
export const USER = "84900000001"

export const envelope = (value: unknown, field: string) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "waba-1", changes: [{ field, value }] }],
})

export const standbyValue = (
  standby: Record<string, unknown>,
  phone = PHONE_ID,
) => ({
  messaging_product: "whatsapp",
  metadata: { display_phone_number: "1555", phone_number_id: phone },
  standby,
})

export const standbyMessage = (id: string, from = USER) => ({
  from,
  id,
  timestamp: "1755700000",
  text: { body: "Test standby message" },
  type: "text",
})

export const contactFor = (waId = USER) => ({
  profile: { name: "Test User" },
  wa_id: waId,
})

export const textEcho = (id: string) => ({
  id,
  timestamp: "1755700001",
  message: {
    messaging_product: "whatsapp",
    to: USER,
    recipient_type: "individual",
    type: "text",
    text: { body: "Your order has shipped." },
  },
})

export const templateEcho = (id: string) => ({
  id,
  timestamp: "1755700002",
  message: {
    messaging_product: "whatsapp",
    to: USER,
    type: "template",
    template: {
      name: "summer_sale_2026",
      language: { code: "en_US" },
      components: [
        {
          type: "header",
          parameters: [{ type: "image", image: { id: "media-1" } }],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: "Maria" },
            { type: "text", text: "25%" },
          ],
        },
      ],
    },
  },
  template: {
    name: "summer_sale_2026",
    language: "en_US",
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hi {{1}}, enjoy {{2}} off!" },
      { type: "FOOTER", text: "Limited time" },
    ],
  },
})

export const handoverValue = (
  type: "control_passed" | "control_taken",
  payload: Record<string, unknown>,
  phone = PHONE_ID,
) => ({
  messaging_product: "whatsapp",
  sender: { phone_number: USER },
  recipient: { phone_number_id: phone, display_phone_number: "1555" },
  type,
  timestamp: "1755700100",
  [type]: payload,
})

export const summaryContext = {
  type: "summary",
  summary: { text: "Customer wants to change the delivery address." },
}

export const historyContext = {
  type: "history",
  history: {
    items: [
      {
        sender_type: "user",
        timestamp: "1755690000",
        message: { type: "text", text: { body: "Where is my order?" } },
      },
      {
        sender_type: "business",
        timestamp: "1755690060",
        message_echo: {
          message: { type: "text", text: { body: "It ships today." } },
        },
      },
      { sender_type: "user", message: { type: "image" } },
      { sender_type: "user", message: {} },
    ],
  },
}

export const CLIENT_SECRET = "secret"
export const makePostRequest = (body: unknown) => {
  const rawBody = JSON.stringify(body)
  const signature = `sha256=${createHmac("sha256", CLIENT_SECRET).update(rawBody, "utf8").digest("hex")}`
  return new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: rawBody,
  })
}
export const baseConfig = {
  clientSecret: CLIENT_SECRET,
  verifyToken: "verify",
  version: "v20.0",
} as never
