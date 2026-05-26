import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { tagResource } from "./resource"

// Aceita hex de 3 ou 6 chars (#abc, #aabbcc). Normalizamos no server pra 7.
const hexColorSchema = z
  .string()
  .regex(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Cor inválida (use formato #RRGGBB)",
  )

// Emoji opcional — máximo 8 chars pra acomodar emojis ZWJ.
const emojiSchema = z.string().trim().max(8).nullish()

// Descrição opcional, até 280 chars (cabe num tooltip ou linha de tabela).
const descriptionSchema = z.string().trim().max(280).nullish()

export const createTagRequest = z.object({
  name: z.string().trim().min(1).max(255),
  color: hexColorSchema.optional(),
  emoji: emojiSchema,
  description: descriptionSchema,
  folderId: zodBigintAsString().nullish(),
  syncToMessenger: z.boolean().nullish(),
})
export type CreateTagRequest = z.input<typeof createTagRequest>

export const createTagResponse = z.object({
  data: tagResource,
})
export type CreateTagResponse = z.infer<typeof createTagResponse>

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(255),
  color: hexColorSchema.optional(),
  emoji: emojiSchema,
  description: descriptionSchema,
})
export type UpdateTagSchema = z.input<typeof updateTagSchema>
