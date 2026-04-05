import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const sequenceStepRelations = defineRelationsPart(schema, (r) => ({
  sequenceStepModel: {
    flow: r.one.flowModel({
      from: r.sequenceStepModel.flowId,
      to: r.flowModel.id,
    }),
    sequence: r.one.sequenceModel({
      from: r.sequenceStepModel.sequenceId,
      to: r.sequenceModel.id,
      optional: false,
    }),
  },
}))
