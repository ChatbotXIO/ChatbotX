import {
  oauthAccessTokenRepository,
  oauthApplicationRepository,
} from "@chatbotx.io/database/repositories"
import type {
  OAuthApplicationModel,
  UserModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
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

    let user: Pick<UserModel, "id" | "email">
    try {
      user = await userService.findByIdOrFail(token.userId)
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
        clientId: token.clientId,
        accessTokenId: token.id,
      },
    }
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
