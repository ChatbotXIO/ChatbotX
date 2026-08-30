import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const minigamePlayRelations = defineRelationsPart(schema, (r) => ({
  minigamePlayModel: {
    minigame: r.one.minigameModel({
      from: r.minigamePlayModel.minigameId,
      to: r.minigameModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.minigamePlayModel.contactId,
      to: r.contactModel.id,
      optional: false,
      alias: "minigamePlay_contact",
    }),
  },
}))
