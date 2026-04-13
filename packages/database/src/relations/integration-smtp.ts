import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationSmtpRelations = defineRelationsPart(schema, (r) => ({
  integrationSmtpModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationSmtpModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationSmtpModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
}))
