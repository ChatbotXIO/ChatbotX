import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const sequenceDispatchRelations = defineRelationsPart(schema, (r) => ({
  sequenceDispatchModel: {
    workspace: r.one.workspaceModel({
      from: r.sequenceDispatchModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    sequence: r.one.sequenceModel({
      from: r.sequenceDispatchModel.sequenceId,
      to: r.sequenceModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.sequenceDispatchModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    enrollment: r.one.contactsOnSequenceModel({
      from: r.sequenceDispatchModel.enrollmentId,
      to: r.contactsOnSequenceModel.id,
      optional: false,
    }),
    step: r.one.sequenceStepModel({
      from: r.sequenceDispatchModel.stepId,
      to: r.sequenceStepModel.id,
      optional: false,
    }),
  },
}))
