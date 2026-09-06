import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { workspaceService } from "../workspace/service"
import { workspaceMemberService } from "../workspace-member/service"
import { resolveWorkspaceMembership } from "../workspace-member/synthetic"

/**
 * The single entry point every auth gate calls to resolve "does this user
 * have access to this workspace, and with what permissions". A real member's
 * workspace comes attached; a platform-support caller has no row, so the
 * workspace is fetched separately — read uncached so `disable()` ends a
 * session on the very next request even if cache invalidation failed —
 * before checking `isSupportAccessEnabled`. Returns `undefined` when the
 * caller has no access at all. See docs/support-access.md.
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
    (await workspaceService.findForAuth({ id: workspaceId }))
  if (!workspace) {
    return
  }

  const member = resolveWorkspaceMembership({ realMember, workspace, user })
  if (!member) {
    return
  }

  return { workspace, member, isSupportSession: !realMember }
}

/**
 * Boolean convenience for gates that only need a yes/no answer (e.g. the
 * OAuth channel-connect callback), not the resolved workspace/member.
 * Composes `workspaceMemberService.findMembership` +
 * `resolveWorkspaceAccess` — no new query shapes.
 */
export async function hasWorkspaceAccess(props: {
  workspaceId: string
  user: Pick<UserModel, "id" | "email">
}): Promise<boolean> {
  const { workspaceId, user } = props

  const realMember = await workspaceMemberService.findMembership({
    workspaceId,
    userId: user.id,
  })

  const access = await resolveWorkspaceAccess({ realMember, workspaceId, user })
  return !!access
}
