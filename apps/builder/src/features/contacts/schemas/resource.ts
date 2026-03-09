import { contactModel, createSelectSchema } from "@aha.chat/database/schema"
import type { CustomFieldType } from "@aha.chat/database/types"
import type { LucideIcon } from "lucide-react"
import type { z } from "zod"

export const contactResource = createSelectSchema(contactModel)
export type ContactResource = z.infer<typeof contactResource>

export type ContactEditableField = {
  key: string
  icon: LucideIcon
  label: string
  value: string | null | undefined
  customFieldType: CustomFieldType
}
