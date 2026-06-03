import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const emailTopicRecipientRelations = defineRelationsPart(
  schema,
  (r) => ({
    emailTopicRecipientModel: {
      topic: r.one.emailTopicModel({
        from: r.emailTopicRecipientModel.topicId,
        to: r.emailTopicModel.id,
      }),
      workspace: r.one.workspaceModel({
        from: r.emailTopicRecipientModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      contact: r.one.contactModel({
        from: r.emailTopicRecipientModel.contactId,
        to: r.contactModel.id,
      }),
    },
  }),
)
