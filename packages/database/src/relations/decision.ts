import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const decisionRelations = defineRelationsPart(schema, (r) => ({
  decisionConnectionModel: {
    workspace: r.one.workspaceModel({
      from: r.decisionConnectionModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    profiles: r.many.decisionProfileModel({
      from: r.decisionConnectionModel.id,
      to: r.decisionProfileModel.connectionId,
    }),
  },
  decisionProfileModel: {
    workspace: r.one.workspaceModel({
      from: r.decisionProfileModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    connection: r.one.decisionConnectionModel({
      from: r.decisionProfileModel.connectionId,
      to: r.decisionConnectionModel.id,
      optional: false,
    }),
  },
}))
