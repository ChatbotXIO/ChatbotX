import { db } from "@chatbotx.io/database/client"
import {
  oauthAccessTokenRepository,
  oauthClientRepository,
  oauthConsentRepository,
  oauthRefreshTokenRepository,
} from "@chatbotx.io/database/repositories"
import type {
  OAuthClientModel,
  UserModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { userService } from "../user/service"
import { isWorkspaceScheduledForDeletion } from "../workspace-lifecycle/predicates"
import { isWorkspaceAdminMember } from "../workspace-member/predicates"
import { workspaceMemberService } from "../workspace-member/service"
import { resolveWorkspaceAccess } from "../workspace-support-access/resolve-access"

export type McpOAuthPrincipal = {
  workspace: WorkspaceModel
  user: Pick<UserModel, "id" | "email">
  clientId: string
}

export type McpOAuthResolution =
  | { kind: "principal"; principal: McpOAuthPrincipal }
  | { kind: "invalidToken" }
  | { kind: "forbidden" }
  | {
      kind: "workspaceSelectionRequired"
      workspaces: { id: string; name: string }[]
    }

export type McpOAuthGrant = {
  clientId: string
  clientName: string
  clientIcon: string | null
  scopes: string[]
  firstAuthorizedAt: Date
  lastRefreshedAt: Date | null
  activeUntil: Date | null
}

export class McpOAuthService extends BaseService {
  async resolvePrincipal(props: {
    clientId: string
    userId: string
    workspaceId?: string
  }): Promise<McpOAuthResolution> {
    const client = await oauthClientRepository.findByClientId(props.clientId)
    if (!client || client.disabled) {
      return { kind: "invalidToken" }
    }

    const user = await this.findTokenUser(props.userId)
    if (!user) {
      return { kind: "invalidToken" }
    }

    const consent = await oauthConsentRepository.findLatestGivenByUserAndClient(
      { userId: user.id, clientId: props.clientId },
    )
    if (!consent) {
      return { kind: "invalidToken" }
    }

    if (
      consent.workspaceId &&
      props.workspaceId &&
      props.workspaceId !== consent.workspaceId
    ) {
      return { kind: "forbidden" }
    }
    let workspaceId = consent.workspaceId ?? props.workspaceId
    if (!workspaceId) {
      const selection = await this.selectOnlyWorkspace(user.id)
      if (selection.kind !== "selected") {
        return selection
      }
      workspaceId = selection.workspaceId
    }

    const workspace = await this.findAdminWorkspace({ user, workspaceId })
    if (!workspace) {
      return { kind: "forbidden" }
    }

    return {
      kind: "principal",
      principal: {
        workspace,
        user,
        clientId: props.clientId,
      },
    }
  }

  /**
   * Workspaces the consent screen offers: the ones where the user is an
   * admin and that are not scheduled for deletion. Cached membership is fine
   * for listing; `bindConsentWorkspace` re-checks uncached.
   */
  async listAuthorizableWorkspaces(props: {
    userId: string
  }): Promise<{ id: string; name: string }[]> {
    const members = await workspaceMemberService.listByUserId({
      userId: props.userId,
    })
    return members
      .filter(
        (member) =>
          !isWorkspaceScheduledForDeletion(member.workspace) &&
          isWorkspaceAdminMember(member),
      )
      .map((member) => ({
        id: member.workspace.id,
        name: member.workspace.name,
      }))
  }

  /**
   * Throws unless the user may authorize an MCP client on this workspace.
   * The consent action calls it before approving so a rejected pick never
   * leaves an unbound consent behind.
   */
  async assertAuthorizableWorkspace(props: {
    user: Pick<UserModel, "id" | "email">
    workspaceId: string
  }): Promise<WorkspaceModel> {
    const workspace = await this.findAdminWorkspace({
      user: props.user,
      workspaceId: props.workspaceId,
    })
    if (!workspace || isWorkspaceScheduledForDeletion(workspace)) {
      throw new ChatbotXException(
        "You must be an admin of the selected workspace",
        "forbidden",
        403,
      )
    }
    return workspace
  }

  /**
   * Binds the client's consent to a workspace once the user approved it.
   * Re-authorizing the same client rebinds every consent it holds for the
   * user, which is how a user switches workspace.
   */
  async bindConsentWorkspace(props: {
    user: Pick<UserModel, "id" | "email">
    clientId: string
    workspaceId: string
  }): Promise<void> {
    const workspace = await this.assertAuthorizableWorkspace(props)
    const updated = await oauthConsentRepository.setWorkspaceByUserAndClient({
      userId: props.user.id,
      clientId: props.clientId,
      workspaceId: workspace.id,
    })
    if (updated === 0) {
      throw new ChatbotXException("OAuth consent not found", "notFound", 404)
    }
    logger.info(
      {
        userId: props.user.id,
        clientId: props.clientId,
        workspaceId: workspace.id,
      },
      "Bound MCP OAuth consent to workspace",
    )
  }

  private async findTokenUser(
    userId: string,
  ): Promise<Pick<UserModel, "id" | "email"> | null> {
    try {
      return await userService.findByIdOrFail(userId)
    } catch (error) {
      if (error instanceof ChatbotXException && error.code === "notFound") {
        return null
      }
      throw error
    }
  }

  /** Legacy fallback for a consent with no bound workspace. */
  private async selectOnlyWorkspace(
    userId: string,
  ): Promise<
    | { kind: "selected"; workspaceId: string }
    | Extract<
        McpOAuthResolution,
        { kind: "forbidden" | "workspaceSelectionRequired" }
      >
  > {
    const workspaces = await this.listAuthorizableWorkspaces({ userId })
    const [onlyWorkspace] = workspaces
    if (workspaces.length === 1 && onlyWorkspace) {
      return { kind: "selected", workspaceId: onlyWorkspace.id }
    }
    if (workspaces.length === 0) {
      return { kind: "forbidden" }
    }

    return {
      kind: "workspaceSelectionRequired",
      workspaces,
    }
  }

  /**
   * OAuth credentials map to a full workspace token, so only workspace
   * admins may hold them. The membership read is uncached so a removal takes
   * effect immediately. Support sessions are rejected because their synthetic
   * membership must never mint durable third-party access.
   */
  private async findAdminWorkspace(props: {
    user: Pick<UserModel, "id" | "email">
    workspaceId: string
  }): Promise<WorkspaceModel | null> {
    const realMember = await workspaceMemberService.findMembership({
      workspaceId: props.workspaceId,
      userId: props.user.id,
    })
    const access = await resolveWorkspaceAccess({
      realMember,
      workspaceId: props.workspaceId,
      user: props.user,
    })
    if (
      !access ||
      access.isSupportSession ||
      !isWorkspaceAdminMember(access.member)
    ) {
      return null
    }
    return access.workspace
  }

  async listGrantsForUser(props: { userId: string }): Promise<McpOAuthGrant[]> {
    const grants = await oauthConsentRepository.listGivenByUser(
      props.userId,
      new Date(),
    )

    return grants.map((grant) => ({
      activeUntil: grant.activeUntil,
      clientIcon: grant.clientIcon,
      clientId: grant.clientId,
      clientName: grant.clientName ?? grant.clientId,
      firstAuthorizedAt: grant.firstAuthorizedAt,
      lastRefreshedAt: grant.lastRefreshedAt,
      scopes: Array.from(new Set(grant.scopes)),
    }))
  }

  async revokeGrant(props: {
    userId: string
    clientId: string
  }): Promise<boolean> {
    const deleted = await db.transaction(async (tx) => {
      const [deletedAccessTokens, deletedConsents, deletedRefreshTokens] =
        await Promise.all([
          oauthAccessTokenRepository.deleteByUserAndClient(props, tx),
          oauthConsentRepository.deleteByUserAndClient(props, tx),
          oauthRefreshTokenRepository.deleteByUserAndClient(props, tx),
        ])
      return deletedAccessTokens + deletedConsents + deletedRefreshTokens
    })

    if (deleted > 0) {
      logger.info({ ...props, deleted }, "Revoked MCP OAuth grant")
    }
    return deleted > 0
  }

  async purgeExpiredTokens(now = new Date()): Promise<number> {
    const [accessTokens, refreshTokens] = await Promise.all([
      oauthAccessTokenRepository.deleteExpired(now),
      oauthRefreshTokenRepository.deleteExpired(now),
    ])
    return accessTokens + refreshTokens
  }

  async findClient(props: {
    clientId: string
  }): Promise<OAuthClientModel | null> {
    return await oauthClientRepository.findByClientId(props.clientId)
  }
}

export const mcpOAuthService = new McpOAuthService()
