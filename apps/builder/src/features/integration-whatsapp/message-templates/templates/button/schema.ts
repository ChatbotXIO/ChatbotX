import { z } from "zod"

export enum ButtonActionType {
  QuickReply = "QUICK_REPLY",
  Url = "URL",
  PhoneNumber = "PHONE_NUMBER",
  Flow = "FLOW",
}

export const buttonBlockSchema = z
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
        url: z.string().url(),
      }),
      z.object({
        type: z.literal(ButtonActionType.Flow),
        flow_id: z.string().min(1),
      }),
      z.object({
        type: z.literal(ButtonActionType.PhoneNumber),
        phone_number: z
          .string()
          .regex(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/),
      }),
    ]),
  )

export type ButtonBlockSchema = z.infer<typeof buttonBlockSchema>

export const buttonBlockDefaultValue = (text = ""): ButtonBlockSchema => ({
  text,
  type: ButtonActionType.QuickReply,
})
