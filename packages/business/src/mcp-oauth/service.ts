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
import { userService } from "../user/service"
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
    const accessToken = await oauthAccessTokenRepository.findByAccessToken(
      props.accessToken,
    )
    if (
      !accessToken?.userId ||
      accessToken.accessTokenExpiresAt <= new Date()
    ) {
      return { kind: "invalidToken" }
    }

    const user = await userService.findByIdOrFail(accessToken.userId)
    const members = await workspaceMemberService.listByUserId({
      userId: user.id,
    })
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

    const access = await resolveWorkspaceAccess({
      realMember: members.find((member) => member.workspaceId === workspaceId),
      workspaceId,
      user,
    })
    if (!access?.member.permissions.superAdmin) {
      return { kind: "forbidden" }
    }

    return {
      kind: "principal",
      principal: {
        workspace: access.workspace,
        user,
        clientId: accessToken.clientId,
        accessTokenId: accessToken.id,
      },
    }
  }

  async findClient(props: {
    clientId: string
  }): Promise<OAuthApplicationModel | null> {
    return await oauthApplicationRepository.findByClientId(props.clientId)
  }
}

export const mcpOAuthService = new McpOAuthService()
