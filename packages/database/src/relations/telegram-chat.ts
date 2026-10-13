import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const telegramChatRelations = defineRelationsPart(schema, (r) => ({
  telegramChatModel: {
    workspace: r.one.workspaceModel({
      from: r.telegramChatModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.telegramChatModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
}))
