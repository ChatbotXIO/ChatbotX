import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { z } from "zod"
import type { MetaConversionsIntegration } from "./schema"

const manualCapiAccessTokenSchema = z.object({
  accessToken: z.string().min(1),
})

const oauthCapiAccessTokenSchema = z.object({
  tokens: z.object({
    accessToken: z.string().min(1),
  }),
})

export type ResolvedCapiAccessToken = {
  accessToken: string
  source: "manual" | "oauth"
}

export async function resolveCapiAccessToken(
  integration: MetaConversionsIntegration,
): Promise<ResolvedCapiAccessToken> {
  // A manual (Custom-connection) token wins over the OAuth page token when
  // present. Read via a property guard, not a channel switch: the column
  // exists on every connect-capable channel, and this keeps working unchanged
  // if a channel ever lacks it.
  if ("capiAccessToken" in integration && integration.capiAccessToken) {
    const manual = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(integration.capiAccessToken),
      manualCapiAccessTokenSchema,
    )

    return {
      accessToken: manual.accessToken,
      source: "manual",
    }
  }

  const auth = oauthCapiAccessTokenSchema.parse(integration.auth)

  return {
    accessToken: auth.tokens.accessToken,
    source: "oauth",
  }
}
