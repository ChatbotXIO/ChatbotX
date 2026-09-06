import { z } from "zod"

export const contactFilterFieldPublicResource = z.object({
  field: z.string(),
  schemaKind: z.enum([
    "boolean",
    "text",
    "multiSelect",
    "select",
    "datetime",
    "number",
  ]),
  optionSource: z.string(),
  operators: z.array(z.string()),
})
export type ContactFilterFieldPublicResource = z.infer<
  typeof contactFilterFieldPublicResource
>

export const contactFilterCustomFieldPublicResource = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
})

export const contactFilterTagPublicResource = z.object({
  id: z.string(),
  name: z.string(),
})

export const listContactFilterFieldsPublicResponse = z.object({
  staticFields: z.array(contactFilterFieldPublicResource),
  customFields: z.array(contactFilterCustomFieldPublicResource),
  botFields: z.array(contactFilterCustomFieldPublicResource),
  tags: z.array(contactFilterTagPublicResource),
})
export type ListContactFilterFieldsPublicResponse = z.infer<
  typeof listContactFilterFieldsPublicResponse
>
