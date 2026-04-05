import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactCustomFieldRelations = defineRelationsPart(schema, (r) => ({
  contactCustomFieldModel: {
    customField: r.one.customFieldModel({
      from: r.contactCustomFieldModel.customFieldId,
      to: r.customFieldModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.contactCustomFieldModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
  },
}))
