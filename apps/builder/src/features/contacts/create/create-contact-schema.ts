import { z } from "zod"
import { Gender } from "@prisma/client"

export const createContactSchema = z.object({
  chatbotId: z.string().cuid2(),
  phoneNumber: z.string().min(10).max(20).regex(/\+?\d{10,20}/),
  email: z.union([
    z.literal(""),
    z.string().max(100).email().trim(),
  ]),
  firstName: z.optional(z.string().max(100).trim()),
  lastName: z.optional(z.string().max(100).trim()),
  gender: z.nativeEnum(Gender),
})

export type CreateContactSchema = z.infer<typeof createContactSchema>
