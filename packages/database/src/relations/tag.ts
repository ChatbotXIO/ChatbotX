import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const tagRelations = defineRelationsPart(schema, (r) => ({
  tagModel: {
    contactsToTags: r.many.contactsToTagsModel({
      from: r.tagModel.id,
      to: r.contactsToTagsModel.tagId,
    }),
    contacts: r.many.contactModel({
      from: r.tagModel.id.through(r.contactsToTagsModel.tagId),
      to: r.contactModel.id.through(r.contactsToTagsModel.contactId),
    }),
  },
}))
