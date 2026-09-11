import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const fbCommentAutomationEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    fbCommentAutomationEventModel: {
      automation: r.one.fbCommentAutomationModel({
        from: r.fbCommentAutomationEventModel.automationId,
        to: r.fbCommentAutomationModel.id,
        optional: false,
      }),
      // Nullable: the FK is `onDelete: "set null"` so an event outlives its
      // contact.
      contact: r.one.contactModel({
        from: r.fbCommentAutomationEventModel.contactId,
        to: r.contactModel.id,
        optional: true,
      }),
      workspace: r.one.workspaceModel({
        from: r.fbCommentAutomationEventModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
