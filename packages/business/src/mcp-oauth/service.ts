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

    let user: Pick<UserModel, "id" | "email">
    try {
      user = await userService.findByIdOrFail(props.userId)
    } catch (error) {
      if (error instanceof ChatbotXException && error.code === "notFound") {
        return { kind: "invalidToken" }
      }
      throw error
    }

    /**
     * OAuth credentials map to a full workspace token, so only workspace
     * admins may authorize them. The cached member list is selection-only;
     * the uncached membership below gates access immediately after removal.
     * Support sessions are rejected because their synthetic membership must
     * never mint durable third-party access.
     */
    const members = (
      await workspaceMemberService.listByUserId({
        userId: user.id,
      })
    ).filter((member) => !isWorkspaceScheduledForDeletion(member.workspace))
    const workspaceId =
      props.workspaceId ??
      (members.length === 1 ? members[0]?.workspaceId : undefined)

    if (!workspaceId) {
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

    const realMember = await workspaceMemberService.findMembership({
      workspaceId,
      userId: user.id,
    })
    const access = await resolveWorkspaceAccess({
      realMember,
      workspaceId,
      user,
    })
    if (
      !access ||
      access.isSupportSession ||
      !isWorkspaceAdminMember(access.member)
    ) {
      return { kind: "forbidden" }
    }

    return {
      kind: "principal",
      principal: {
        workspace: access.workspace,
        user,
        clientId: props.clientId,
      },
    }
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
