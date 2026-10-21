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

const MAX_ADMIN_WORKSPACE_MEMBERS = 20

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
   * (and every member) by email — provisioning a fresh root-tenant user and
   * mailing temporary credentials where needed, exactly like `Admins` does —
   * then creates the workspace with every member attached in the single
   * transaction `workspaceService.create` already opens. This is the one
   * service both the `/admin/workspaces` action and a future server-to-server
   * platform API call into (data-access rule: public path and private path
   * share one service method).
   *
   * Accepted risk: a member/owner provisioned here before step 3 or 5 throws
   * stays in the DB with a mailed password but no workspace membership. A
   * retry is idempotent — the existing user is found by email instead of
   * provisioned again, so no second mail goes out — matching `Admins.add`.
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

    // One owner, one owned workspace (invariant checked here rather than
    // relying on `workspaceService.create`'s community-edition lock, which
    // only applies to that edition).
    const existingWorkspace = await workspaceService.findActiveByOwner({
      ownerId: owner.userId,
    })
    if (existingWorkspace) {
      throw ownerAlreadyHasWorkspaceException()
    }

    const tenantId = await workspaceService.resolveTenantForOwner(owner.userId)
    const members = await Promise.all(
      memberEmails.map((email) => this.resolveMember({ email, tenantId })),
    )

    const hasRoom = await quotaEnforcementService.hasRoomForTeamMembers({
      userId: owner.userId,
      additionalCount: 1 + members.length,
    })
    if (!hasRoom) {
      throw teamMembersLimitReachedException()
    }

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
   * Members are resolved in the owner's own tenant (invariant 10): a
   * root-tenant owner's members auto-provision like the owner does, but a
   * reseller sub-account owner's members must already exist in that tenant —
   * auto-provisioning there would silently create an unrelated root-tenant
   * account for the same address instead of reusing the tenant member.
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
