import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const selectBlockSchema = z.object({
  id: z.string().cuid2(),
  selected: z.string().min(1).max(255),
  items: z.array(
    z.object({ id: z.string().cuid(), name: z.string(), value: z.string() }),
  ),
  label: z.string().nullable(),
  placeholder: z.string().nullable(),
  actionType: z.enum([ActionType.EmailTopic]),
})
export type SelectBlockSchema = z.infer<typeof selectBlockSchema>

export const selectBlockDefaultValue = (selected = ""): SelectBlockSchema => ({
  id: createId(),
  selected,
  items: [],
  actionType: ActionType.EmailTopic,
  label: null,
  placeholder: null,
})
