import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const addNoteBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.AddNote),
  message: z.string().min(1).max(1000).trim(),
})

export type AddNoteBlockSchema = z.infer<typeof addNoteBlockSchema>

export const addNoteBlockDefaultValue = (): AddNoteBlockSchema => ({
  id: createId(),
  actionType: ActionType.AddNote,
  message: "",
})
