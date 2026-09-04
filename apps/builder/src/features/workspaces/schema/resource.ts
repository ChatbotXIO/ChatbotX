import {
  createSelectSchema,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

// `.omit({ token: true })`: Workspace.token is the deprecated, read-only
// legacy plaintext source for {{api_key}} — it must never round-trip through
// a client-facing resource. This is a live public API response shape
// (GET /v1/workspaces, GET /users/me/workspaces), so a bare
// createSelectSchema(workspaceModel) would otherwise leak it verbatim.
export const workspaceResource = createSelectSchema(workspaceModel, {
  id: zodBigintAsString(),
}).omit({ token: true })
export type WorkspaceResource = z.infer<typeof workspaceResource>

export const withWorkspaceIdSchema = z.object({
  workspaceId: zodBigintAsString(),
})

export const withWorkspaceIdAndIdSchema = z.object({
  workspaceId: zodBigintAsString(),
  id: zodBigintAsString(),
})
