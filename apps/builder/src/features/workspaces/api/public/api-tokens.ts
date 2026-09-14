import { workspaceApiTokenService } from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { generateWorkspaceToken } from "@chatbotx.io/business/workspace-api-token/credentials"
import {
  possibleErrorsOnCreatingWorkspaceApiToken,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingWorkspaceApiToken,
} from "@/lib/orpc/orpc-error-helper"
import {
  paginateInMemory,
  publicListRequest,
  publicListResponse,
} from "@/lib/public-api/list"
import { workspaceTokenAdminAPI } from "@/orpc"
import {
  createWorkspaceApiTokenPublicRequest,
  createWorkspaceApiTokenPublicResponse,
  getWorkspaceApiTokenPublicRequest,
  toPublicWorkspaceApiToken,
  updateWorkspaceApiTokenPublicRequest,
  workspaceApiTokenPublicResource,
} from "../../schema/public"

const tags = ["API Tokens"]

export const apiTokensPublicRouter = {
  list: workspaceTokenAdminAPI
    .route({
      method: "GET",
      path: "/v1/api-tokens",
      summary: "List workspace API tokens",
      tags,
    })
    .input(publicListRequest)
    .output(publicListResponse(workspaceApiTokenPublicResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const tokens = await workspaceApiTokenService.listTokens({
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(tokens.map(toPublicWorkspaceApiToken), input)
    }),

  get: workspaceTokenAdminAPI
    .route({
      method: "GET",
      path: "/v1/api-tokens/{id}",
      summary: "Get a workspace API token",
      tags,
    })
    .input(getWorkspaceApiTokenPublicRequest)
    .output(workspaceApiTokenPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toPublicWorkspaceApiToken(
        await workspaceApiTokenService.findTokenOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    ),

  create: workspaceTokenAdminAPI
    .route({
      method: "POST",
      path: "/v1/api-tokens",
      summary: "Create a workspace API token",
      successStatus: 201,
      tags,
    })
    .input(createWorkspaceApiTokenPublicRequest)
    .output(createWorkspaceApiTokenPublicResponse)
    .errors(possibleErrorsOnCreatingWorkspaceApiToken)
    .handler(async ({ context, input }) => {
      const { token, tokenHash, tokenPrefix } = await generateWorkspaceToken()
      const apiToken = await workspaceApiTokenService.createToken({
        workspaceId: context.workspace.id,
        ...input,
        tokenHash,
        tokenPrefix,
      })

      return { apiToken: toPublicWorkspaceApiToken(apiToken), token }
    }),

  update: workspaceTokenAdminAPI
    .route({
      method: "PATCH",
      path: "/v1/api-tokens/{id}",
      summary: "Update a workspace API token",
      tags,
    })
    .input(updateWorkspaceApiTokenPublicRequest)
    .output(workspaceApiTokenPublicResource)
    .errors(possibleErrorsOnMutatingWorkspaceApiToken)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return toPublicWorkspaceApiToken(
        await workspaceApiTokenService.updateToken({
          workspaceId: context.workspace.id,
          id,
          ...data,
        }),
      )
    }),

  rotate: workspaceTokenAdminAPI
    .route({
      method: "POST",
      path: "/v1/api-tokens/{id}/rotate",
      summary: "Rotate a workspace API token",
      tags,
    })
    .input(getWorkspaceApiTokenPublicRequest)
    .output(createWorkspaceApiTokenPublicResponse)
    .errors(possibleErrorsOnMutatingWorkspaceApiToken)
    .handler(async ({ context, input }) => {
      const { token, tokenHash, tokenPrefix } = await generateWorkspaceToken()
      const apiToken = await workspaceApiTokenService.rotateToken({
        workspaceId: context.workspace.id,
        id: input.id,
        tokenHash,
        tokenPrefix,
      })

      return { apiToken: toPublicWorkspaceApiToken(apiToken), token }
    }),

  delete: workspaceTokenAdminAPI
    .route({
      method: "DELETE",
      path: "/v1/api-tokens/{id}",
      summary: "Delete a workspace API token",
      successStatus: 204,
      tags,
    })
    .input(getWorkspaceApiTokenPublicRequest)
    .errors(possibleErrorsOnMutatingWorkspaceApiToken)
    .handler(async ({ context, input }) => {
      const apiToken = await workspaceApiTokenService.findTokenOrFail({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      if (apiToken.isDefault) {
        throw new ChatbotXException(
          "The default workspace API token cannot be modified",
          "workspaceApiTokenImmutable",
        )
      }

      const deleted = await workspaceApiTokenService.deleteToken({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      if (!deleted) {
        throw notFoundException("Workspace API token not found")
      }
    }),
}
