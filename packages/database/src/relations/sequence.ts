import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const sequenceRelations = defineRelationsPart(schema, (r) => ({
  sequenceModel: {
    folder: r.one.folderModel({
      from: r.sequenceModel.folderId,
      to: r.folderModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.sequenceModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    sequenceSteps: r.many.sequenceStepModel({
      from: r.sequenceModel.id,
      to: r.sequenceStepModel.sequenceId,
    }),
    contactsOnSequences: r.many.contactsOnSequenceModel({
      from: r.sequenceModel.id,
      to: r.contactsOnSequenceModel.sequenceId,
    }),
    contacts: r.many.contactModel({
      from: r.sequenceModel.id.through(r.contactsOnSequenceModel.sequenceId),
      to: r.contactModel.id.through(r.contactsOnSequenceModel.contactId),
    }),
  },
}))
