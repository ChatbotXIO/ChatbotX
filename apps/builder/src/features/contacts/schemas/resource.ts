import { contactModel, createSelectSchema } from "@chatbotx.io/database/schema"
import type { CustomFieldType } from "@chatbotx.io/database/types"
import type { LucideIcon } from "lucide-react"
import type z from "zod"

export const contactResource = createSelectSchema(contactModel)
export type ContactResource = z.infer<typeof contactResource>

export type ContactEditableField = {
  key: string
  icon: LucideIcon
  label: string
  value: string | null | undefined
  type: CustomFieldType
}

export const publicContactResource = contactResource.pick({
  id: true,
  phoneNumber: true,
  email: true,
  firstName: true,
  lastName: true,
  gender: true,
  source: true,
  sourceId: true,
})
