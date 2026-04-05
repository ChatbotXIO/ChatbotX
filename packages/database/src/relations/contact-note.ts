import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactNoteRelations = defineRelationsPart(schema, (r) => ({
  contactNoteModel: {
    contact: r.one.contactModel({
      from: r.contactNoteModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    createdBy: r.one.userModel({
      from: r.contactNoteModel.createdById,
      to: r.userModel.id,
    }),
  },
}))
