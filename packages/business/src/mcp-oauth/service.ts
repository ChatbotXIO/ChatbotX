import { db } from "@chatbotx.io/database/client"
import {
  oauthAccessTokenRepository,
  oauthApplicationRepository,
  oauthConsentRepository,
} from "@chatbotx.io/database/repositories"
import type {
  OAuthApplicationModel,
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
  accessTokenId: string
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
    accessToken: string
    workspaceId?: string
  }): Promise<McpOAuthResolution> {
    const token = await oauthAccessTokenRepository.findByAccessToken(
      props.accessToken,
    )
    const now = new Date()
    if (
      !token?.userId ||
      token.accessTokenExpiresAt <= now ||
      token.client.disabled
    ) {
      return { kind: "invalidToken" }
    }

    const user = await this.findTokenUser(token.userId)
    if (!user) {
      return { kind: "invalidToken" }
    }

    /**
     * Every authorization passes the consent screen, so a token without a
     * given consent was revoked or lost its workspace to a cascade. Rejecting
     * it makes the client re-authorize instead of silently switching to
     * another workspace.
     */
    const consent = await oauthConsentRepository.findLatestGivenByUserAndClient(
      { userId: user.id, clientId: token.clientId },
    )
    if (!consent) {
      return { kind: "invalidToken" }
    }

    // An explicit URL/header selection wins; otherwise the workspace picked
    // on the consent screen. Consents given before the picker have none.
    let workspaceId = props.workspaceId ?? consent.workspaceId ?? undefined
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
        clientId: token.clientId,
        accessTokenId: token.id,
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
    userId: string
    workspaceId: string
  }): Promise<WorkspaceModel> {
    const user = await userService.findByIdOrFail(props.userId)
    const workspace = await this.findAdminWorkspace({
      user,
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
    userId: string
    clientId: string
    workspaceId: string
  }): Promise<void> {
    const workspace = await this.assertAuthorizableWorkspace(props)
    const updated = await oauthConsentRepository.setWorkspaceByUserAndClient({
      userId: props.userId,
      clientId: props.clientId,
      workspaceId: workspace.id,
    })
    if (updated === 0) {
      throw new ChatbotXException("OAuth consent not found", "notFound", 404)
    }
    logger.info(
      {
        userId: props.userId,
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
    const members = (
      await workspaceMemberService.listByUserId({ userId })
    ).filter((member) => !isWorkspaceScheduledForDeletion(member.workspace))
    const [onlyMember] = members
    if (members.length === 1 && onlyMember) {
      return { kind: "selected", workspaceId: onlyMember.workspaceId }
    }
    if (members.length === 0) {
      return { kind: "forbidden" }
    }

    return {
      kind: "workspaceSelectionRequired",
      workspaces: members.map((member) => ({
        id: member.workspace.id,
        name: member.workspace.name,
      })),
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
      clientName: grant.clientName,
      firstAuthorizedAt: grant.firstAuthorizedAt,
      lastRefreshedAt: grant.lastRefreshedAt,
      scopes: Array.from(new Set(grant.scopes.split(" ").filter(Boolean))),
    }))
  }

  async revokeGrant(props: {
    userId: string
    clientId: string
  }): Promise<boolean> {
    const deleted = await db.transaction(async (tx) => {
      const deletedTokens =
        await oauthAccessTokenRepository.deleteByUserAndClient(props, tx)
      const deletedConsents =
        await oauthConsentRepository.deleteByUserAndClient(props, tx)
      return deletedTokens + deletedConsents
    })

    if (deleted > 0) {
      logger.info({ ...props, deleted }, "Revoked MCP OAuth grant")
    }
    return deleted > 0
  }

  async purgeExpiredTokens(now = new Date()): Promise<number> {
    return await oauthAccessTokenRepository.deleteExpired(now)
  }

  async findClient(props: {
    clientId: string
  }): Promise<OAuthApplicationModel | null> {
    return await oauthApplicationRepository.findByClientId(props.clientId)
  }
}

export const mcpOAuthService = new McpOAuthService()
