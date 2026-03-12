import { z } from "zod"

export const customFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  customFieldType: z.enum([
    "shortText",
    "number",
    "date",
    "datetime",
    "boolean",
    "longText",
  ]),
  description: z.string().nullable(),
})
export type CustomField = z.infer<typeof customFieldSchema>

export const contactCustomFieldSchema = customFieldSchema.extend({
  value: z.string(),
})
export type ContactCustomField = z.infer<typeof contactCustomFieldSchema>
