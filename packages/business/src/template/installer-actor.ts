import type { TemplateActorKind } from "@chatbotx.io/database/partials"
import type {
  TemplateInstallationModel,
  TemplateModel,
} from "@chatbotx.io/database/types"
import { ChatbotXException } from "../errors"
import { userService } from "../user"
import { workspaceMemberService } from "../workspace-member"
import { resolveWorkspaceAccess } from "../workspace-support-access/resolve-access"
import {
  assertCanUseTemplateCategories,
  type TemplateActor,
} from "./permissions"

/**
 * Who an installation acts as when nobody is clicking (the worker, an
 * automatic update): the installing member with their current permissions,
 * or full token power for an API-token install. `null` when that member has
 * lost access to the workspace.
 */
export const resolveInstallerActor = async (installation: {
  installedBy: TemplateInstallationModel["installedBy"]
  installedByKind: TemplateActorKind
  workspaceId: string
}): Promise<TemplateActor | null> => {
  // A workspace API token has no member row; it was authorized (full
  // permission, `templates` scope) when the request was made.
  if (installation.installedByKind === "apiToken") {
    return { kind: "apiToken", permission: "full" }
  }
  // A member whose user row is gone (`installedBy` set null by the delete)
  // has lost access; it must never fall through to token power.
  if (!installation.installedBy) {
    return null
  }
  // Through `resolveWorkspaceAccess`, never `WorkspaceMember` alone: a
  // platform-support session has a synthetic membership and no row
  // (invariant 19), and ending the support window must end its installs.
  const installer = await userService.findNameAndEmail(installation.installedBy)
  const access = installer
    ? await resolveWorkspaceAccess({
        realMember: await workspaceMemberService.findMembership({
          workspaceId: installation.workspaceId,
          userId: installation.installedBy,
        }),
        workspaceId: installation.workspaceId,
        user: { id: installation.installedBy, email: installer.email ?? "" },
      })
    : undefined
  return access
    ? { kind: "member", permissions: access.member.permissions }
    : null
}

/** Throws unless the installer still holds the permission of every category about to be installed. */
export const assertInstallerMayInstall = async (input: {
  installation: TemplateInstallationModel
  categoryCounts: TemplateModel["categoryCounts"]
}): Promise<void> => {
  const actor = await resolveInstallerActor(input.installation)
  if (!actor) {
    throw new ChatbotXException(
      "The installer no longer has access to this workspace",
      "templateCategoryPermissionDenied",
      403,
    )
  }
  assertCanUseTemplateCategories(actor, input.categoryCounts)
}
