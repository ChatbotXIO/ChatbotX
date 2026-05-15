import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const analyticsContactEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    analyticsContactEventModel: {
      workspace: r.one.workspaceModel({
        from: r.analyticsContactEventModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)

export const analyticsBotMessageEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    analyticsBotMessageEventModel: {
      workspace: r.one.workspaceModel({
        from: r.analyticsBotMessageEventModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)

export const analyticsConversationEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    analyticsConversationEventModel: {
      workspace: r.one.workspaceModel({
        from: r.analyticsConversationEventModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)

export const analyticsBroadcastEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    analyticsBroadcastEventModel: {
      workspace: r.one.workspaceModel({
        from: r.analyticsBroadcastEventModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)

export const analyticsSequenceEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    analyticsSequenceEventModel: {
      workspace: r.one.workspaceModel({
        from: r.analyticsSequenceEventModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)

export const analyticsFlowNodeEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    analyticsFlowNodeEventModel: {
      workspace: r.one.workspaceModel({
        from: r.analyticsFlowNodeEventModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)
