import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const socialPostTargetSetRelations = defineRelationsPart(
  schema,
  (r) => ({
    socialPostTargetSetModel: {
      workspace: r.one.workspaceModel({
        from: r.socialPostTargetSetModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      destinations: r.many.socialPostTargetSetDestinationModel({
        from: r.socialPostTargetSetModel.id,
        to: r.socialPostTargetSetDestinationModel.targetSetId,
      }),
    },
    socialPostTargetSetDestinationModel: {
      targetSet: r.one.socialPostTargetSetModel({
        from: r.socialPostTargetSetDestinationModel.targetSetId,
        to: r.socialPostTargetSetModel.id,
        optional: false,
      }),
      destination: r.one.publishDestinationModel({
        from: r.socialPostTargetSetDestinationModel.publishDestinationId,
        to: r.publishDestinationModel.id,
        optional: false,
      }),
    },
  }),
)
