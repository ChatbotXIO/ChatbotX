import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { z } from "zod"

const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000 // 1 year

const encryptedPayloadSchema = z.object({
  cid: z.string(),
  wid: z.string(),
  exp: z.number(),
})

const payloadSchema = encryptedPayloadSchema.omit({ exp: true })
type UnsubscribePayload = z.infer<typeof payloadSchema>

export async function buildUnsubscribeUrl(
  appUrl: string,
  contactId: string,
  workspaceId: string,
): Promise<string> {
  return `${appUrl}/unsubscribe?token=${await generateUnsubscribeToken(contactId, workspaceId)}`
}

async function generateUnsubscribeToken(
  contactId: string,
  workspaceId: string,
): Promise<string> {
  const encrypted = await encryptUtils.encryptObject({
    cid: contactId,
    wid: workspaceId,
    exp: Date.now() + TOKEN_TTL_MS,
  })
  return Buffer.from(JSON.stringify(encrypted)).toString("base64url")
}

export async function verifyUnsubscribeToken(
  token: string,
): Promise<UnsubscribePayload> {
  const json = Buffer.from(token, "base64url").toString("utf8")
  const encrypted = encryptedDataSchema.parse(JSON.parse(json))
  const { exp, ...payload } = await encryptUtils.decryptObject(
    encrypted,
    encryptedPayloadSchema,
  )
  if (exp < Date.now()) {
    throw new Error("Unsubscribe token has expired")
  }
  return payload
}
