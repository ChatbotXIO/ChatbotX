import botFieldWorkspaceTokenAPIs from "@/features/bot-fields/api/workspace-token"
import { broadcastWorkspaceTokenAPIs } from "@/features/broadcasts/api/workspace-token"
import contactWorkspaceTokenAPIs from "@/features/contacts/api/workspace-token"
import customFieldWorkspaceTokenAPIs from "@/features/custom-fields/api/workspace-token"
import flowWorkspaceTokenAPIs from "@/features/flows/api/workspace-token"
import { tagWorkspaceTokenAPIs } from "@/features/tags/api/token-auth"

export const publicRouter = {
  ...contactWorkspaceTokenAPIs,
  ...customFieldWorkspaceTokenAPIs,
  ...tagWorkspaceTokenAPIs,
  ...flowWorkspaceTokenAPIs,
  ...botFieldWorkspaceTokenAPIs,
  ...broadcastWorkspaceTokenAPIs,
}
