import { z } from "zod"

export const blockContactSchema = z.object({
  ids: z.array(z.string().cuid2()),
})
export type BlockContactSchema = z.infer<typeof blockContactSchema>

export const blockContactBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type BlockContactBindSchema = [chatbotId: string]
