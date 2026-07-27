import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const whatsappSignupSessionRelations = defineRelationsPart(
  schema,
  (r) => ({
    whatsappSignupSessionModel: {
      user: r.one.userModel({
        from: r.whatsappSignupSessionModel.userId,
        to: r.userModel.id,
        optional: false,
      }),
      owner: r.one.userModel({
        from: r.whatsappSignupSessionModel.ownerId,
        to: r.userModel.id,
        optional: false,
      }),
      workspace: r.one.workspaceModel({
        from: r.whatsappSignupSessionModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)
