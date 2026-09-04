import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { workspaceService } from "../workspace/service"
import { resolveWorkspaceMembership } from "../workspace-member/synthetic"

/**
 * The single entry point every auth gate calls to resolve "does this user
 * have access to this workspace, and with what permissions". A real member's
 * workspace comes attached; a platform-support caller has no row, so the
 * workspace is fetched separately (cached under `workspaces:${id}`, which
 * `WorkspaceSupportAccessService.enable/disable` invalidate) before checking
 * `isSupportAccessEnabled`. Returns `undefined` when the caller has no
 * access at all. See docs/support-access.md.
 */
export async function resolveWorkspaceAccess<
  TMember extends { userId: string; permissions: WorkspaceMemberPermissions },
>(props: {
  realMember: (TMember & { workspace?: WorkspaceModel }) | undefined
  workspaceId: string
  user: Pick<UserModel, "id" | "email">
}): Promise<
  | {
      workspace: WorkspaceModel
      member: TMember | WorkspaceMemberModel
      isSupportSession: boolean
    }
  | undefined
> {
  const { realMember, workspaceId, user } = props

  const workspace =
    realMember?.workspace ??
    (await workspaceService.find({ where: { id: workspaceId } }))
  if (!workspace) {
    return
  }

  const member = resolveWorkspaceMembership({ realMember, workspace, user })
  if (!member) {
    return
  }

  return { workspace, member, isSupportSession: !realMember }
}
