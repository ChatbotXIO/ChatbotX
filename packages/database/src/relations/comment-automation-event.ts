import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const commentAutomationEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    commentAutomationEventModel: {
      automation: r.one.commentAutomationModel({
        from: r.commentAutomationEventModel.automationId,
        to: r.commentAutomationModel.id,
        optional: false,
      }),
      // Nullable: the FK is `onDelete: "set null"` so an event outlives its
      // contact.
      contact: r.one.contactModel({
        from: r.commentAutomationEventModel.contactId,
        to: r.contactModel.id,
        optional: true,
      }),
      // Nullable for the same reason as `contact`: the FK is
      // `onDelete: "set null"`.
      contactInbox: r.one.contactInboxModel({
        from: r.commentAutomationEventModel.contactInboxId,
        to: r.contactInboxModel.id,
        optional: true,
      }),
      workspace: r.one.workspaceModel({
        from: r.commentAutomationEventModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
