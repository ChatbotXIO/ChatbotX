import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { z } from "zod"

const payloadSchema = z.object({
  cid: z.string(),
  wid: z.string(),
})
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
  })
  return Buffer.from(JSON.stringify(encrypted)).toString("base64url")
}

export function verifyUnsubscribeToken(
  token: string,
): Promise<UnsubscribePayload> {
  const json = Buffer.from(token, "base64url").toString("utf8")
  const encrypted = encryptedDataSchema.parse(JSON.parse(json))
  return encryptUtils.decryptObject(encrypted, payloadSchema)
}
