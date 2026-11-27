import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const commentModerationLogRelations = defineRelationsPart(
  schema,
  (r) => ({
    commentModerationLogModel: {
      automation: r.one.commentAutomationModel({
        from: r.commentModerationLogModel.automationId,
        to: r.commentAutomationModel.id,
        optional: false,
      }),
      // Nullable: the FK is `onDelete: "set null"` so a log row outlives its
      // contact.
      contact: r.one.contactModel({
        from: r.commentModerationLogModel.contactId,
        to: r.contactModel.id,
        optional: true,
      }),
      // Nullable for the same reason as `contact`: the FK is
      // `onDelete: "set null"`.
      contactInbox: r.one.contactInboxModel({
        from: r.commentModerationLogModel.contactInboxId,
        to: r.contactInboxModel.id,
        optional: true,
      }),
      workspace: r.one.workspaceModel({
        from: r.commentModerationLogModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
