import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const automationThrottleRelations = defineRelationsPart(schema, (r) => ({
  automationThrottleModel: {
    workspace: r.one.workspaceModel({
      from: r.automationThrottleModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    contactInbox: r.one.contactInboxModel({
      from: r.automationThrottleModel.contactInboxId,
      to: r.contactInboxModel.id,
      optional: false,
    }),
  },
}))
