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
  // When set, the read-only value renders as an external link (e.g. an ad
  // source URL). Only used for read-only fields.
  href?: string | null
  // Marks a workspace custom-field row (as opposed to a built-in contact
  // field). Drives the reset-custom-fields affordance, which must not depend
  // on the contact's currently cached values — a freshly added field that has
  // just been given a value is a custom field too.
  isCustomField?: boolean
}
