import { z } from "zod"

const TOKEN_PREFIX = "watf"
const STRICT_DIGITS_REGEX = /^\d+$/
const MAX_SIGNED_BIGINT = 9223372036854775807n

const bigintIdSchema = z
  .string()
  .regex(STRICT_DIGITS_REGEX)
  .refine((value) => {
    try {
      return BigInt(value) <= MAX_SIGNED_BIGINT
    } catch {
      return false
    }
  }, "Value exceeds the signed bigint range")

const intIndexSchema = z
  .union([
    z.number().int().min(0),
    z.string().regex(STRICT_DIGITS_REGEX).transform(Number),
  ])
  .pipe(z.number().int().min(0))

export const TemplateFlowOrigin = {
  Broadcast: "b",
  FlowStep: "s",
} as const
export type TemplateFlowOrigin =
  (typeof TemplateFlowOrigin)[keyof typeof TemplateFlowOrigin]

export const broadcastTemplateFlowTokenSchema = z.object({
  origin: z.literal(TemplateFlowOrigin.Broadcast),
  broadcastId: bigintIdSchema,
  buttonIndex: intIndexSchema,
  cardIndex: intIndexSchema.optional(),
})

export const flowStepTemplateFlowTokenSchema = z.object({
  origin: z.literal(TemplateFlowOrigin.FlowStep),
  flowId: bigintIdSchema,
  flowVersionId: bigintIdSchema.optional(),
  stepId: bigintIdSchema,
  buttonIndex: intIndexSchema,
  cardIndex: intIndexSchema.optional(),
})

export const templateFlowTokenSchema = z.discriminatedUnion("origin", [
  broadcastTemplateFlowTokenSchema,
  flowStepTemplateFlowTokenSchema,
])

export type BroadcastTemplateFlowToken = z.infer<
  typeof broadcastTemplateFlowTokenSchema
>
export type FlowStepTemplateFlowToken = z.infer<
  typeof flowStepTemplateFlowTokenSchema
>
export type TemplateFlowToken = z.infer<typeof templateFlowTokenSchema>

export const isTemplateFlowToken = (
  token: string | null | undefined,
): boolean => typeof token === "string" && token.startsWith(`${TOKEN_PREFIX}:`)

export const encodeTemplateFlowToken = (token: TemplateFlowToken): string => {
  if (token.origin === TemplateFlowOrigin.Broadcast) {
    return [
      TOKEN_PREFIX,
      token.origin,
      token.broadcastId,
      token.buttonIndex,
      token.cardIndex ?? "",
    ].join(":")
  }

  return [
    TOKEN_PREFIX,
    token.origin,
    token.flowId,
    token.flowVersionId ?? "",
    token.stepId,
    token.buttonIndex,
    token.cardIndex ?? "",
  ].join(":")
}

export const decodeTemplateFlowToken = (
  rawToken: string | null | undefined,
): TemplateFlowToken | null => {
  if (!isTemplateFlowToken(rawToken)) {
    return null
  }

  const token = rawToken as string
  const parts = token.split(":")

  try {
    if (parts[0] !== TOKEN_PREFIX) {
      return null
    }

    if (parts[1] === TemplateFlowOrigin.Broadcast) {
      if (!(parts.length === 4 || parts.length === 5)) {
        return null
      }

      const [, origin, broadcastId, buttonIndex, cardIndex] = parts
      return templateFlowTokenSchema.parse({
        origin,
        broadcastId,
        buttonIndex,
        cardIndex: cardIndex || undefined,
      })
    }

    if (parts[1] === TemplateFlowOrigin.FlowStep) {
      if (!(parts.length === 6 || parts.length === 7)) {
        return null
      }

      const [, origin, flowId, flowVersionId, stepId, buttonIndex, cardIndex] =
        parts
      return templateFlowTokenSchema.parse({
        origin,
        flowId,
        flowVersionId: flowVersionId || undefined,
        stepId,
        buttonIndex,
        cardIndex: cardIndex || undefined,
      })
    }
  } catch {
    return null
  }

  return null
}
