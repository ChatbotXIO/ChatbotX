import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const sequenceEventRelations = defineRelationsPart(schema, (r) => ({
  sequenceEventModel: {
    workspace: r.one.workspaceModel({
      from: r.sequenceEventModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    sequence: r.one.sequenceModel({
      from: r.sequenceEventModel.sequenceId,
      to: r.sequenceModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.sequenceEventModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
  },
}))
