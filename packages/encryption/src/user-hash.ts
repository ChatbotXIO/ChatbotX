import { bytesToHex, hexToBytes } from "./binary"
import { env } from "./keys"

export type UserHashParams = {
  sourceId: string
  contactInboxId: string
}

const serializeUserHashParams = ({
  sourceId,
  contactInboxId,
}: UserHashParams): string => `${sourceId}:${contactInboxId}`

export const signUserHash = async (params: UserHashParams): Promise<string> => {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    hexToBytes(env.ENCRYPTION_KEY),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  )
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(serializeUserHashParams(params)),
  )
  return bytesToHex(new Uint8Array(signature))
}
