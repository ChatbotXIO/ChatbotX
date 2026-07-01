import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const fbCommentAutomationReplyRelations = defineRelationsPart(
  schema,
  (r) => ({
    fbCommentAutomationReplyModel: {
      automation: r.one.fbCommentAutomationModel({
        from: r.fbCommentAutomationReplyModel.automationId,
        to: r.fbCommentAutomationModel.id,
        optional: false,
      }),
      contact: r.one.contactModel({
        from: r.fbCommentAutomationReplyModel.contactId,
        to: r.contactModel.id,
        optional: false,
      }),
      workspace: r.one.workspaceModel({
        from: r.fbCommentAutomationReplyModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
