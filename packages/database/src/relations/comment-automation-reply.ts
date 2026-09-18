import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const commentAutomationReplyRelations = defineRelationsPart(
  schema,
  (r) => ({
    commentAutomationReplyModel: {
      automation: r.one.commentAutomationModel({
        from: r.commentAutomationReplyModel.automationId,
        to: r.commentAutomationModel.id,
        optional: false,
      }),
      contact: r.one.contactModel({
        from: r.commentAutomationReplyModel.contactId,
        to: r.contactModel.id,
        optional: false,
      }),
      workspace: r.one.workspaceModel({
        from: r.commentAutomationReplyModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
