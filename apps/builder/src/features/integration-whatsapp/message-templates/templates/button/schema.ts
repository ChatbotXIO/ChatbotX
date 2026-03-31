import { z } from "zod"

export const buttonActionTypes = z.enum([
  "quickReply",
  "url",
  "phoneNumber",
  "flow",
])

export const buttonStepSchema = z
  .object({
    text: z.string().min(1).max(100),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal(buttonActionTypes.enum.quickReply),
      }),
      z.object({
        type: z.literal(buttonActionTypes.enum.url),
        url: z.url(),
      }),
      z.object({
        type: z.literal(buttonActionTypes.enum.flow),
        flow_id: z.string().min(1),
      }),
      z.object({
        type: z.literal(buttonActionTypes.enum.phoneNumber),
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

export type ButtonStepProps = z.infer<typeof buttonStepSchema>

export const buttonStepDefaultFn = (text = ""): ButtonStepProps => ({
  text,
  type: buttonActionTypes.enum.quickReply,
})
