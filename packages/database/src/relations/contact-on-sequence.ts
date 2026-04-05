import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactsOnSequenceRelations = defineRelationsPart(schema, (r) => ({
  contactsOnSequenceModel: {
    contact: r.one.contactModel({
      from: r.contactsOnSequenceModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    sequence: r.one.sequenceModel({
      from: r.contactsOnSequenceModel.sequenceId,
      to: r.sequenceModel.id,
      optional: false,
    }),
    workspace: r.one.workspaceModel({
      from: r.contactsOnSequenceModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
