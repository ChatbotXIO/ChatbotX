import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const minigameContactRelations = defineRelationsPart(schema, (r) => ({
  minigameContactModel: {
    minigame: r.one.minigameModel({
      from: r.minigameContactModel.minigameId,
      to: r.minigameModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.minigameContactModel.contactId,
      to: r.contactModel.id,
      optional: false,
      alias: "minigameContact_contact",
    }),
    referrerContact: r.one.contactModel({
      from: r.minigameContactModel.referrerContactId,
      to: r.contactModel.id,
      alias: "minigameContact_referrerContact",
    }),
  },
}))
