import {
  pipelineReferenceRepository,
  pipelineRepository,
} from "@chatbotx.io/database/repositories"
import type { PipelineMemberModel } from "@chatbotx.io/database/types"
import { ChatbotXException, notFoundException } from "../errors"
import {
  normalizePipelinePermissions,
  type PipelineAccessScope,
  type PipelinePermissions,
} from "./access"
import { PipelineBaseService } from "./pipeline-base.service"

/** Per-pipeline ACL rows. */
export class PipelineMemberService extends PipelineBaseService {
  async listMembers(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
  }): Promise<PipelineMemberModel[]> {
    await this.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      scope: input.scope,
      action: "manageSettings",
    })
    return await pipelineRepository.listMembers({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
    })
  }

  async setMember(input: {
    workspaceId: string
    pipelineId: string
    workspaceMemberId: string
    scope: PipelineAccessScope
    permissions: PipelinePermissions
  }): Promise<PipelineMemberModel> {
    const { workspaceId, pipelineId, workspaceMemberId } = input
    await this.requireAccess({
      workspaceId,
      pipelineId,
      scope: input.scope,
      action: "manageSettings",
    })
    const [member] = await pipelineReferenceRepository.listWorkspaceMembers({
      workspaceId,
      ids: [workspaceMemberId],
    })
    if (!member) {
      throw notFoundException("Workspace member not found")
    }
    const normalized = normalizePipelinePermissions(input.permissions)
    await this.assertCanGrant({
      workspaceId,
      pipelineId,
      scope: input.scope,
      target: workspaceMemberId,
      granted: normalized,
    })
    const row = await pipelineRepository.upsertMember({
      workspaceId,
      pipelineId,
      workspaceMemberId,
      values: normalized,
    })
    await this.audit(
      "update",
      `set pipeline ${pipelineId} permissions of member ${workspaceMemberId}`,
    )
    return row
  }

  async removeMember(input: {
    workspaceId: string
    pipelineId: string
    workspaceMemberId: string
    scope: PipelineAccessScope
  }): Promise<void> {
    await this.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      scope: input.scope,
      action: "manageSettings",
    })
    // Taking access away from others is always allowed; a plain member still
    // never changes their own row (the same rule as granting).
    const { scope } = input
    if (
      scope.kind === "member" &&
      !scope.isWorkspaceAdmin &&
      scope.workspaceMemberId === input.workspaceMemberId
    ) {
      throw new ChatbotXException(
        "You cannot grant permissions you do not hold or change your own",
        "forbidden",
        403,
      )
    }
    const removed = await pipelineRepository.deleteMember({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      workspaceMemberId: input.workspaceMemberId,
    })
    if (!removed) {
      throw notFoundException("Pipeline member not found")
    }
    await this.audit(
      "update",
      `removed member ${input.workspaceMemberId} from pipeline ${input.pipelineId}`,
    )
  }

  /**
   * A plain member who may manage settings can share what they hold but not
   * raise anyone's rights — their own included. Admins, tokens and support
   * sessions are not limited.
   */
  private async assertCanGrant(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
    target: string
    granted: PipelinePermissions
  }) {
    const { scope } = input
    if (scope.kind !== "member" || scope.isWorkspaceAdmin) {
      return
    }
    const held = await this.permissionsFor(input)
    const exceeds = (
      Object.keys(input.granted) as Array<keyof PipelinePermissions>
    ).some((flag) => input.granted[flag] && !held[flag])
    if (exceeds || input.target === scope.workspaceMemberId) {
      throw new ChatbotXException(
        "You cannot grant permissions you do not hold or change your own",
        "forbidden",
        403,
      )
    }
  }
}

/**
 * The source's ACL rows for a copy. A plain member who duplicates owns the
 * copy like a creator: a full grant, replacing any narrower row they held on
 * the source.
 */
export function membersForCopy(input: {
  workspaceId: string
  members: PipelineMemberModel[]
  pipelineId: string
  scope: PipelineAccessScope
}) {
  const { workspaceId, pipelineId, scope } = input
  const duplicatorId =
    scope.kind === "member" && !scope.isWorkspaceAdmin
      ? scope.workspaceMemberId
      : null
  const copied = input.members
    .filter((member) => member.workspaceMemberId !== duplicatorId)
    .map((member) => ({
      workspaceId,
      pipelineId,
      workspaceMemberId: member.workspaceMemberId,
      canView: member.canView,
      canEdit: member.canEdit,
      canDelete: member.canDelete,
      canManageSettings: member.canManageSettings,
    }))
  return duplicatorId
    ? [
        ...copied,
        {
          workspaceId,
          pipelineId,
          workspaceMemberId: duplicatorId,
          canView: true,
          canEdit: true,
          canDelete: true,
          canManageSettings: true,
        },
      ]
    : copied
}

export const pipelineMemberService = new PipelineMemberService()
