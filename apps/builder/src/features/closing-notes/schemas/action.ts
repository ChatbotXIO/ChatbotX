import { closingNotesModes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
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

// Validação básica aqui: server faz validação contextual extra baseada
// no closingNotesMode do workspace (categoryId/summary podem ser exigidos
// quando modo = mandatoryDialog/mandatoryBoth).
export const closeConversationWithNoteRequest = z.object({
  conversationId: zodBigintAsString(),
  categoryId: zodBigintAsString().optional(),
  summary: z.string().trim().max(2000).optional(),
})
export type CloseConversationWithNoteRequest = z.infer<
  typeof closeConversationWithNoteRequest
>
