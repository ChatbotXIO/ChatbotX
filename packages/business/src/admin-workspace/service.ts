import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import { userRepository } from "@chatbotx.io/database/repositories"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { dispatchAuditRecord } from "../audit/dispatcher"
import {
  adminWorkspaceMemberNotFoundException,
  ChatbotXException,
  ownerAlreadyHasWorkspaceException,
  teamMembersLimitReachedException,
} from "../errors"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { findOrProvisionRootUser } from "../user/provision-root-user"
import { workspaceService } from "../workspace/service"

export const MAX_ADMIN_WORKSPACE_MEMBERS = 20

export type AdminWorkspaceProvisionedMember = {
  email: string
  userId: string
  created: boolean
}

export type AdminWorkspaceCreateWithMembersResult = {
  workspace: WorkspaceModel
  owner: AdminWorkspaceProvisionedMember
  members: AdminWorkspaceProvisionedMember[]
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

class AdminWorkspaceService {
  /**
   * Admin console "create workspace for an owner" flow: resolves the owner
   * by email — provisioning a fresh root-tenant user and mailing a temporary
   * password where needed, exactly like `Admins` does — checks team-member
   * room for the owner plus every member up front, then resolves each
   * member by email (provisioning/mailing as needed) and creates the
   * workspace with every member attached in the single transaction
   * `workspaceService.create` already opens. This is the one service both
   * the `/admin/workspaces` action and a future server-to-server platform
   * API call into (data-access rule: public path and private path share one
   * service method).
   *
   * Accepted risk: the owner is provisioned before the quota check, so an
   * over-limit request can leave only that account orphaned with a mailed
   * password and no workspace membership. After the check passes, member
   * provisioning occurs outside the workspace transaction, so a later member
   * resolution or workspace-creation failure can also orphan any newly
   * provisioned members. Retries are idempotent — existing users are found by
   * email instead of provisioned again, so no second mail goes out — matching
   * `Admins.add`. The quota ordering still guarantees an over-limit request
   * never provisions or mails a member.
   */
  async createWithMembers(props: {
    actorId: string
    name: string
    ownerEmail: string
    memberEmails: string[]
    permissions: WorkspaceMemberPermissions
  }): Promise<AdminWorkspaceCreateWithMembersResult> {
    const ownerEmail = normalizeEmail(props.ownerEmail)
    const memberEmails = [
      ...new Set(props.memberEmails.map(normalizeEmail)),
    ].filter((email) => email !== ownerEmail)
    if (memberEmails.length > MAX_ADMIN_WORKSPACE_MEMBERS) {
      throw new ChatbotXException(
        `At most ${MAX_ADMIN_WORKSPACE_MEMBERS} members can be added at once.`,
        "tooManyMembers",
        400,
      )
    }

    const owner = await findOrProvisionRootUser(ownerEmail)

    // These reads are independent, but the guards below intentionally keep
    // the existing-workspace error ahead of the team-member quota error.
    const [existingWorkspace, tenantId, hasRoom] = await Promise.all([
      workspaceService.findActiveByOwner({ ownerId: owner.userId }),
      workspaceService.resolveTenantForOwner(owner.userId),
      quotaEnforcementService.hasRoomForTeamMembers({
        userId: owner.userId,
        additionalCount: 1 + memberEmails.length,
      }),
    ])
    if (existingWorkspace) {
      throw ownerAlreadyHasWorkspaceException()
    }
    if (!hasRoom) {
      throw teamMembersLimitReachedException()
    }

    const members = await Promise.all(
      memberEmails.map((email) => this.resolveMember({ email, tenantId })),
    )

    const workspace = await workspaceService.create({
      data: { name: props.name, ownerId: owner.userId, tenantId },
      createdBy: owner.userId,
      members: members.map((member) => ({
        userId: member.userId,
        permissions: props.permissions,
      })),
    })

    await dispatchAuditRecord({
      userId: props.actorId,
      workspaceId: workspace.id,
      action: "create",
      detail:
        `created the workspace (#${workspace.id}) for ${ownerEmail}` +
        (owner.created ? " (new account)" : "") +
        (members.length > 0
          ? ` with members: ${members
              .map((m) => `${m.email}${m.created ? " (new account)" : ""}`)
              .join(", ")}`
          : ""),
    })

    return { workspace, owner: { email: ownerEmail, ...owner }, members }
  }

  /**
   * Members are resolved in the owner's own tenant (invariant 10). The owner
   * always comes from `findOrProvisionRootUser` (root tenant), so a non-root
   * `tenantId` here only happens when the owner *owns* a reseller tenant
   * (`resolveTenantForOwner`, `workspace/service.ts:650`) — in that case
   * members must already exist in that tenant; auto-provisioning would
   * silently create an unrelated root-tenant account for the same address
   * instead of reusing the tenant member.
   */
  private async resolveMember(props: {
    email: string
    tenantId: string
  }): Promise<AdminWorkspaceProvisionedMember> {
    if (props.tenantId === ROOT_TENANT_ID) {
      const provisioned = await findOrProvisionRootUser(props.email)
      return { email: props.email, ...provisioned }
    }

    const existing = await userRepository.findIdByEmail({
      email: props.email,
      tenantId: props.tenantId,
    })
    if (!existing) {
      throw adminWorkspaceMemberNotFoundException(props.email)
    }
    return { email: props.email, userId: existing.id, created: false }
  }
}

export const adminWorkspaceService = new AdminWorkspaceService()
