import { z } from "zod"
import {
  WA_OAUTH_RESULT,
  type WhatsappOAuthRelayResult,
} from "../libs/embedded-signup"

const whatsappOAuthRelayResultSchema = z.object({
  type: z.literal(WA_OAUTH_RESULT),
  status: z.enum(["success", "error"]),
  code: z.string().optional(),
}) satisfies z.ZodType<WhatsappOAuthRelayResult>

export function parseOAuthRelayResult(params: {
  origin: string
  brokerOrigin: string
  data: unknown
}):
  | { type: "ignored" }
  | { type: "success"; code: string }
  | { type: "error" } {
  if (params.origin !== params.brokerOrigin) {
    return { type: "ignored" }
  }

  const parsed = whatsappOAuthRelayResultSchema.safeParse(params.data)
  if (!parsed.success) {
    return { type: "ignored" }
  }

  if (parsed.data.status === "success") {
    return parsed.data.code
      ? { type: "success", code: parsed.data.code }
      : { type: "error" }
  }

  return { type: "error" }
}
