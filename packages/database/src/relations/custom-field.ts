import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const customFieldRelations = defineRelationsPart(schema, (r) => ({
  customFieldModel: {
    contacts: r.many.contactModel({
      from: r.customFieldModel.id.through(
        r.contactCustomFieldModel.customFieldId,
      ),
      to: r.contactModel.id.through(r.contactCustomFieldModel.contactId),
    }),
    reflinks: r.many.reflinkModel({
      from: r.customFieldModel.id,
      to: r.reflinkModel.customFieldId,
    }),
  },
}))
