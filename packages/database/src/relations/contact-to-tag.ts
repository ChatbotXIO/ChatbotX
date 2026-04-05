import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactsToTagsRelations = defineRelationsPart(schema, (r) => ({
  contactsToTagsModel: {
    contact: r.one.contactModel({
      from: r.contactsToTagsModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    tag: r.one.tagModel({
      from: r.contactsToTagsModel.tagId,
      to: r.tagModel.id,
      optional: false,
    }),
  },
}))
