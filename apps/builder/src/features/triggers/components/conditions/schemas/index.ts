import { TriggerCondition } from "@aha.chat/database/enums"
import z from "zod"
import { customFieldValueChanged } from "./custom-field-value-changed"
import { dateTimeBasedTrigger } from "./date-time-based-trigger"
import { tagApplied } from "./tag-applied"
import { tagRemoved } from "./tag-removed"

export const allConditions = {
  tagApplied,
  tagRemoved,
  customFieldValueChanged,
  dateTimeBasedTrigger,
  base: z.object({
    type: z.enum(TriggerCondition),
  }),
}
