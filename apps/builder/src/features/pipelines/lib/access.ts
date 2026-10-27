import {
  type PipelineAccessScope,
  userPipelineActor,
} from "@chatbotx.io/business/pipeline"
import { hasWorkspacePermission } from "@chatbotx.io/business/workspace-member/permissions"
import { isWorkspaceAdminMember } from "@chatbotx.io/business/workspace-member/predicates"
import { workspaceMemberRoles } from "@chatbotx.io/database/partials"
import type { WorkspaceMemberModel } from "@chatbotx.io/database/types"

/** A workspace API token is governed by its scope, not by per-pipeline grants. */
export const PIPELINE_TOKEN_SCOPE: PipelineAccessScope = {
  kind: "workspaceToken",
}

/** Scope of a resolved member (oRPC context, where the member is already loaded). */
export function pipelineScopeFromMember(input: {
  workspaceMember: Pick<WorkspaceMemberModel, "id" | "permissions"> & {
    role: string
  }
  isSupportSession: boolean
}): PipelineAccessScope {
  if (input.isSupportSession) {
    return { kind: "support" }
  }
  return {
    kind: "member",
    workspaceMemberId: input.workspaceMember.id,
    isWorkspaceAdmin: isWorkspaceAdminMember({
      permissions: input.workspaceMember.permissions,
      // A row of an unknown role is never an admin.
      role:
        workspaceMemberRoles.safeParse(input.workspaceMember.role).data ??
        "agent",
    }),
    canViewContactEmailAndPhone: hasWorkspacePermission(
      input.workspaceMember.permissions,
      "emailAndPhone",
    ),
  }
}

type PipelineActionContext = {
  user: { id: string }
  workspaceMember: Parameters<
    typeof pipelineScopeFromMember
  >[0]["workspaceMember"]
  isSupportSession: boolean
}

/** Scope and actor of the signed-in member behind a server action. */
export function pipelineActionCaller(ctx: PipelineActionContext) {
  return {
    scope: pipelineScopeFromMember(ctx),
    actor: userPipelineActor(ctx.user.id),
  }
}
