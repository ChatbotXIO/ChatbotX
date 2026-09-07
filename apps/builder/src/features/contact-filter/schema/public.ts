import { z } from "zod"

const contactFilterFieldPublicResource = z.object({
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

const contactFilterCustomFieldPublicResource = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
})

const contactFilterTagPublicResource = z.object({
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
