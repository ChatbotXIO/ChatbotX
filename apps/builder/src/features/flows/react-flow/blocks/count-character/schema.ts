import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const countCharacterSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.CountCharacters),
  fromCustomFieldId: z.string().cuid2(),
  customFieldId: z.string().cuid2(),
})
export type CountCharacterSchema = z.infer<typeof countCharacterSchema>

export const countCharacterDefaultValue = (): CountCharacterSchema => ({
  id: createId(),
  actionType: ActionType.CountCharacters,
  fromCustomFieldId: "",
  customFieldId: "",
})
