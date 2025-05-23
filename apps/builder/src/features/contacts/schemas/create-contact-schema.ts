import { Gender } from "@ahachat.ai/database/types"
import { z } from "zod"

export const createContactSchema = z.object({
  phoneNumber: z
    .string()
    .min(10)
    .max(20)
    .regex(/\+?\d{10,20}/),
  email: z.union([z.literal(""), z.string().max(100).email()]),
  firstName: z.optional(z.string().trim().max(100)),
  lastName: z.optional(z.string().trim().max(100)),
  gender: z.nativeEnum(Gender),
})
export type CreateContactRequest = z.infer<typeof createContactSchema>

export const createContactBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type CreateContactBindSchema = [chatbotId: string]
