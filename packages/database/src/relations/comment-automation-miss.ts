import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const commentAutomationMissRelations = defineRelationsPart(
  schema,
  (r) => ({
    commentAutomationMissModel: {
      automation: r.one.commentAutomationModel({
        from: r.commentAutomationMissModel.automationId,
        to: r.commentAutomationModel.id,
        optional: false,
      }),
      // Nullable: the FK is `onDelete: "set null"` so a miss outlives its
      // contact.
      contact: r.one.contactModel({
        from: r.commentAutomationMissModel.contactId,
        to: r.contactModel.id,
        optional: true,
      }),
      // Nullable for the same reason as `contact`: the FK is
      // `onDelete: "set null"`.
      contactInbox: r.one.contactInboxModel({
        from: r.commentAutomationMissModel.contactInboxId,
        to: r.contactInboxModel.id,
        optional: true,
      }),
      workspace: r.one.workspaceModel({
        from: r.commentAutomationMissModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
