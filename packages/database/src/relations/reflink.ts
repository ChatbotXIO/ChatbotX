import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const reflinkRelations = defineRelationsPart(schema, (r) => ({
  reflinkModel: {
    flow: r.one.flowModel({
      from: r.reflinkModel.flowId,
      to: r.flowModel.id,
      optional: false,
    }),
    customField: r.one.customFieldModel({
      from: r.reflinkModel.customFieldId,
      to: r.customFieldModel.id,
    }),
  },
}))
