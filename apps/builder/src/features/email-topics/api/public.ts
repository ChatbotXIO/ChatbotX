import { emailTopicService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createEmailTopicPublicRequest,
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
    .errors(possibleErrorsOnCreatingResource)
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
    .errors(possibleErrorsOnMutatingResource)
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
      await emailTopicService.delete({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
