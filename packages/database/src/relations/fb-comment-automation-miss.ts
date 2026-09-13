import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const fbCommentAutomationMissRelations = defineRelationsPart(
  schema,
  (r) => ({
    fbCommentAutomationMissModel: {
      automation: r.one.fbCommentAutomationModel({
        from: r.fbCommentAutomationMissModel.automationId,
        to: r.fbCommentAutomationModel.id,
        optional: false,
      }),
      // Nullable: the FK is `onDelete: "set null"` so a miss outlives its
      // contact.
      contact: r.one.contactModel({
        from: r.fbCommentAutomationMissModel.contactId,
        to: r.contactModel.id,
        optional: true,
      }),
      // Nullable for the same reason as `contact`: the FK is
      // `onDelete: "set null"`.
      contactInbox: r.one.contactInboxModel({
        from: r.fbCommentAutomationMissModel.contactInboxId,
        to: r.contactInboxModel.id,
        optional: true,
      }),
      workspace: r.one.workspaceModel({
        from: r.fbCommentAutomationMissModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
