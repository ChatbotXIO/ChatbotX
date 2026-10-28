import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactReferralEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    contactReferralEventModel: {
      workspace: r.one.workspaceModel({
        from: r.contactReferralEventModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      contactInbox: r.one.contactInboxModel({
        from: r.contactReferralEventModel.contactInboxId,
        to: r.contactInboxModel.id,
        optional: false,
      }),
    },
  }),
)
