import { emailTopicService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingEmailTopic,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingEmailTopic,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createEmailTopicPublicRequest,
  emailTopicPublicResource,
  listEmailTopicsPublicRequest,
  listEmailTopicsPublicResponse,
  updateEmailTopicPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

export const emailTopicsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/email-topics",
      summary: "List email topics",
      tags: ["EmailTopics"],
    })
    .input(listEmailTopicsPublicRequest)
    .output(listEmailTopicsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await emailTopicService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/email-topics/{id}",
      summary: "Get email topic",
      tags: ["EmailTopics"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(emailTopicPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await emailTopicService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/email-topics",
      summary: "Create an email topic",
      successStatus: 201,
      tags: ["EmailTopics"],
    })
    .input(createEmailTopicPublicRequest)
    .output(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnCreatingEmailTopic)
    .handler(async ({ context, input }) => {
      const topic = await emailTopicService.create({
        workspaceId: context.workspace.id,
        data: input,
      })
      return { id: topic.id }
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/email-topics/{id}",
      summary: "Update email topic",
      tags: ["EmailTopics"],
    })
    .input(updateEmailTopicPublicRequest)
    .output(emailTopicPublicResource)
    .errors(possibleErrorsOnMutatingEmailTopic)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await emailTopicService.update({
        workspaceId: context.workspace.id,
        id,
        data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/email-topics/{id}",
      summary: "Delete email topic",
      successStatus: 204,
      tags: ["EmailTopics"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      // `delete` is a bulk method for the UI's multi-select, which treats a
      // partially-applied delete as success. A single-id REST DELETE is a
      // different contract: 204 for an id that was nonexistent or foreign
      // would tell the caller a topic is gone that still exists.
      const { deletedCount } = await emailTopicService.delete({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
      if (deletedCount === 0) {
        throw notFoundException("Email topic not found")
      }
    }),
}
