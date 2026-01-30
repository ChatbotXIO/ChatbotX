import { z } from "zod"

const buttonPayloadSchema = z.object({
  f: z.string(),
  fv: z.string().optional(),
  b: z.string(),
})
export type ButtonPayload = {
  flowId: string
  flowVersionId?: string
  buttonId: string
}

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
    const parsed = buttonPayloadSchema.parse(JSON.parse(atob(payload)))
    return {
      flowId: parsed.f,
      flowVersionId: parsed.fv,
      buttonId: parsed.b,
    }
  } catch (error) {
    console.error("Unable to decode button payload", { error })
    return null
  }
}
