import { z } from "zod"

const buttonPayloadSchema = z
  .object({
    f: z.string(),
    fv: z.string().optional(),
    b: z.string().optional(),
  })
  .transform((data) => {
    return {
      flowId: data.f,
      ...(data.fv ? { flowVersionId: data.fv } : {}), // mark the field to be optional
      ...(data.b ? { buttonId: data.b } : {}), // mark the field to be optional
    }
  })
export type ButtonPayload = z.infer<typeof buttonPayloadSchema>

export const encodeButtonPayload = (props: ButtonPayload) => {
  return btoa(
    JSON.stringify({
      f: props.flowId,
      fv: props.flowVersionId,
      b: props.buttonId,
    }),
  )
}

export const decodeButtonPayload = (payload: string): ButtonPayload | null => {
  try {
    return buttonPayloadSchema.parse(JSON.parse(atob(payload)))
  } catch (error) {
    // Compact format used by Telegram to stay within the 64-byte callback_data limit.
    // Format: "{flowId}.{buttonId}" — split on the first ".".
    const dotIndex = payload.indexOf(".")
    if (dotIndex > 0 && dotIndex < payload.length - 1) {
      const flowId = payload.slice(0, dotIndex)
      const buttonId = payload.slice(dotIndex + 1)
      return { flowId, buttonId }
    }
    console.error("Unable to decode button payload", { error })
    return null
  }
}
