import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { contactModel, createSelectSchema } from "@chatbotx.io/database/schema"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import type { LucideIcon } from "lucide-react"
import { z } from "zod"

export const contactResource = createSelectSchema(contactModel, {
  id: z.string(),
  workspaceId: z.string(),
})
export type ContactResource = z.infer<typeof contactResource>

export type ContactEditableField = {
  key: string
  icon: LucideIcon
  label: string
  value: string | null | undefined
  formValue?: string | null | undefined
  contactInboxId?: string | null | undefined
  options?: SelectOption[]
  type: CustomFieldType
  readOnly?: boolean
}
