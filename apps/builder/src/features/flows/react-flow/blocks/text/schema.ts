import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ButtonBlockSchema, buttonBlockSchema } from "../button/schema"
import { BlockType } from "../types"

export const textBlockSchema = z.object({
  id: z.string().cuid2(),
  blockType: z.enum([BlockType.Text]),
  message: z.string().min(1).max(1000).trim(),
  buttons: z.array(buttonBlockSchema)
})

export type TextBlockSchema = z.infer<typeof textBlockSchema>

export const textBlockSchemaDefaultValue = (message = "", buttons: ButtonBlockSchema[] = []): TextBlockSchema => ({
  id: createId(),
  blockType: BlockType.Text,
  message,
  buttons,
})
