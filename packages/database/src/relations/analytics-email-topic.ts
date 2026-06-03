import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const analyticsEmailTopicRelations = defineRelationsPart(
  schema,
  (r) => ({
    analyticsEmailTopicModel: {
      topic: r.one.emailTopicModel({
        from: r.analyticsEmailTopicModel.topicId,
        to: r.emailTopicModel.id,
      }),
      workspace: r.one.workspaceModel({
        from: r.analyticsEmailTopicModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      contact: r.one.contactModel({
        from: r.analyticsEmailTopicModel.contactId,
        to: r.contactModel.id,
      }),
    },
  }),
)
