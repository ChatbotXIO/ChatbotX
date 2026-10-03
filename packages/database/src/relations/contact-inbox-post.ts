import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactInboxPostRelations = defineRelationsPart(schema, (r) => ({
  contactInboxPostModel: {
    contactInbox: r.one.contactInboxModel({
      from: r.contactInboxPostModel.contactInboxId,
      to: r.contactInboxModel.id,
      optional: false,
    }),
    channelPost: r.one.channelPostModel({
      from: r.contactInboxPostModel.postId,
      to: r.channelPostModel.id,
      optional: false,
    }),
  },
}))
