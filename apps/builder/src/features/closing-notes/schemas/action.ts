import { closingNotesModes } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const createCategoryRequest = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
})
export type CreateCategoryRequest = z.infer<typeof createCategoryRequest>

export const updateCategoryRequest = createCategoryRequest
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequest>

export const updateClosingNotesModeRequest = z.object({
  mode: closingNotesModes,
})
export type UpdateClosingNotesModeRequest = z.infer<
  typeof updateClosingNotesModeRequest
>
