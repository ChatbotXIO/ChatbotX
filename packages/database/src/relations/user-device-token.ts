import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const userDeviceTokenRelations = defineRelationsPart(schema, (r) => ({
  userDeviceTokenModel: {
    user: r.one.userModel({
      from: r.userDeviceTokenModel.userId,
      to: r.userModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.userDeviceTokenModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
