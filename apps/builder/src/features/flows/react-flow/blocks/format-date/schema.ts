import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export enum FormatTimezone {
  Contact = "Contact",
  Account = "Account",
}

export const formatDateSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.FormatDate),
  fromCustomFieldId: z.string().cuid2(),
  format: z.string().min(0),
  customFieldId: z.string().cuid2(),
  formatTimezone: z.nativeEnum(FormatTimezone),
})
export type FormatDateSchema = z.infer<typeof formatDateSchema>

export const formatDateDefaultValue = (): FormatDateSchema => ({
  id: createId(),
  actionType: ActionType.FormatDate,
  fromCustomFieldId: "",
  format: "",
  customFieldId: "",
  formatTimezone: FormatTimezone.Contact,
})
