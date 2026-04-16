import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const extractMetadata = (
  key: string,
  metadata?: { [key: string]: string },
): string | undefined => {
  if (!metadata) {
    return undefined
  }

  return metadata[key] || undefined
}

const buttonPayloadSchema = z
  .object({
    f: zodBigintAsString(),
    fv: zodBigintAsString().optional(),
    b: zodBigintAsString().optional(),
    br: zodBigintAsString().optional(),
  })
  .transform((data) => {
    return {
      flowId: data.f,
      ...(data.fv ? { flowVersionId: data.fv } : {}), // mark the field to be optional
      ...(data.b ? { buttonId: data.b } : {}), // mark the field to be optional
      ...(data.br ? { broadcastId: data.br } : {}), // mark the field to be optional
    }
  })
export type ButtonPayload = z.infer<typeof buttonPayloadSchema>

export const encodeButtonPayload = (props: ButtonPayload) => {
  return btoa(
    JSON.stringify({
      f: props.flowId,
      fv: props.flowVersionId,
      b: props.buttonId,
      br: props.broadcastId,
    }),
  )
}

export const decodeButtonPayload = (payload: string): ButtonPayload | null => {
  try {
    return buttonPayloadSchema.parse(JSON.parse(atob(payload)))
  } catch (error) {
    console.error("Unable to decode button payload", { error })
    return null
  }
}
