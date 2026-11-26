import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const publishDestinationRelations = defineRelationsPart(schema, (r) => ({
  publishDestinationModel: {
    workspace: r.one.workspaceModel({
      from: r.publishDestinationModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.publishDestinationModel.inboxId,
      to: r.inboxModel.id,
    }),
    socialAccountDestination: r.one.socialAccountDestinationModel({
      from: r.publishDestinationModel.socialAccountDestinationId,
      to: r.socialAccountDestinationModel.id,
    }),
  },
  publishDestinationScheduleModel: {
    workspace: r.one.workspaceModel({
      from: r.publishDestinationScheduleModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    destination: r.one.publishDestinationModel({
      from: r.publishDestinationScheduleModel.publishDestinationId,
      to: r.publishDestinationModel.id,
      optional: false,
    }),
  },
}))
