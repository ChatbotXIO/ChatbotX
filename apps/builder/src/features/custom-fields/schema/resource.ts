import { customFieldTypes } from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const customFieldResource = createSelectSchema(customFieldModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  type: customFieldTypes,
})
export type CustomFieldResource = z.infer<typeof customFieldResource>

export const publicCustomFieldResource = customFieldResource.pick({
  id: true,
  name: true,
  type: true,
  description: true,
})

/** Custom field definition as `customFields.*` returns it: adds its folder. */
export const publicCustomFieldDefinitionResource =
  publicCustomFieldResource.extend({
    folderId: z
      .string()
      .nullable()
      .describe("Folder the field is in, or null when it is at the root."),
  })
