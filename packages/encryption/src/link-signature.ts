import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "./keys"

export type MeLinkParams = {
  workspaceId: string
  sourceId: string
  integrationId: string
  formId: string
}

const serializeMeLinkParams = (params: MeLinkParams): string =>
  `${params.workspaceId}:${params.sourceId}:${params.integrationId}:${params.formId}`

export const signMeLink = (params: MeLinkParams): string =>
  createHmac("sha256", Buffer.from(env.ENCRYPTION_KEY, "hex"))
    .update(serializeMeLinkParams(params))
    .digest("hex")

export const verifyMeLink = (
  params: MeLinkParams,
  hash: string | null | undefined,
): boolean => {
  if (!hash) {
    return false
  }

  const expected = signMeLink(params)
  const expectedBuffer = Buffer.from(expected, "hex")
  const actualBuffer = Buffer.from(hash, "hex")

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}
