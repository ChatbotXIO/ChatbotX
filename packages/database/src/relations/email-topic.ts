import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const emailTopicRelations = defineRelationsPart(schema, (r) => ({
  emailTopicModel: {
    workspace: r.one.workspaceModel({
      from: r.emailTopicModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    folder: r.one.folderModel({
      from: r.emailTopicModel.folderId,
      to: r.folderModel.id,
    }),
    recipients: r.many.analyticsEmailTopicModel({
      from: r.emailTopicModel.id,
      to: r.analyticsEmailTopicModel.topicId,
    }),
  },
}))
