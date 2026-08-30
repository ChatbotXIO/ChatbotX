import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const listTagsInput = z.object({})
export type ListTagsInput = z.infer<typeof listTagsInput>

export const createTagInput = z.object({
  name: z.string().trim().min(1).max(255),
})
export type CreateTagInput = z.infer<typeof createTagInput>

export const getTagInput = z.object({ idOrName: z.string() })
export type GetTagInput = z.infer<typeof getTagInput>

export const updateTagInput = z.object({
  id: zodBigintAsString(),
  name: z.string().trim().min(1).max(255),
})
export type UpdateTagInput = z.infer<typeof updateTagInput>

export const deleteTagInput = z.object({ id: zodBigintAsString() })
export type DeleteTagInput = z.infer<typeof deleteTagInput>
