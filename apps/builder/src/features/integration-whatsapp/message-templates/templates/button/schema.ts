import { z } from "zod"

export const ButtonActionType = {
  QuickReply: "QUICK_REPLY",
  Url: "URL",
  PhoneNumber: "PHONE_NUMBER",
  Flow: "FLOW",
} as const

export const buttonStepSchema = z
  .object({
    text: z.string().min(1).max(100),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal(ButtonActionType.QuickReply),
      }),
      z.object({
        type: z.literal(ButtonActionType.Url),
        url: z.string().trim().url(),
      }),
      z.object({
        type: z.literal(ButtonActionType.Flow),
        flow_id: z.string().min(1),
      }),
      z.object({
        type: z.literal(ButtonActionType.PhoneNumber),
        phone_number: z
          .string()
          .trim()
          .max(20)
          .regex(/^\+?[1-9][0-9]{7,18}$/, {
            message: "Invalid phone number format",
          }),
      }),
    ]),
  )

export type ButtonStepSchema = z.infer<typeof buttonStepSchema>

export const buttonStepDefaultFn = (text = ""): ButtonStepSchema => ({
  text,
  type: ButtonActionType.QuickReply,
})
