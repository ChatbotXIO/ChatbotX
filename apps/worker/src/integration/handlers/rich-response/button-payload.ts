import type { RichButtonPayloadEntry } from "@chatbotx.io/worker-config"
import { z } from "zod"
import { type RichAction, richActionSchema } from "."

const NUMERIC_ID_RE = /^\d+$/

export const richButtonPayloadSchema = z.union([
  z.object({ type: z.literal("send_flow"), flowId: z.string().min(1) }),
  z.object({
    type: z.literal("actions"),
    actions: z.array(richActionSchema).min(1),
  }),
  z.object({ type: z.literal("text"), text: z.string().min(1).max(1000) }),
  z.object({ type: z.literal("unsupported"), reason: z.string() }),
])

export type RichButtonPayload = z.infer<typeof richButtonPayloadSchema>

export function parseRichButtonPayload(
  payload: string | undefined,
): RichButtonPayload {
  const normalized = payload?.trim()
  if (!normalized) {
    return { type: "unsupported", reason: "empty_payload" }
  }

  if (NUMERIC_ID_RE.test(normalized)) {
    return { type: "send_flow", flowId: normalized }
  }

  try {
    const parsed = JSON.parse(normalized) as unknown
    const result = z
      .object({ actions: z.array(richActionSchema).min(1) })
      .safeParse(parsed)
    if (result.success) {
      return { type: "actions", actions: result.data.actions }
    }
  } catch {
    return { type: "unsupported", reason: "invalid_json_payload" }
  }

  return { type: "unsupported", reason: "unsupported_payload_shape" }
}

export function buildRichButtonPayloadEntry(input: {
  executionId: string
  buttonId: string
  payload: RichButtonPayload
}): RichButtonPayloadEntry {
  return {
    executionId: input.executionId,
    buttonId: input.buttonId,
    payload:
      input.payload.type === "actions"
        ? {
            type: "actions",
            actions: input.payload.actions satisfies RichAction[],
          }
        : input.payload,
  }
}
