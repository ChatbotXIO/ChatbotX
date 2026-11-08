import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { pollOperations } from "../lib/operations"
import {
  bulkDeletePollsResponse,
  listPollsPublicRequest,
  listPollsPublicResponse,
  pollAnalyticsResource,
  pollBulkDeleteRequest,
  pollFormRequest,
  pollIdRequest,
  pollLinksResource,
  pollResource,
  updatePollPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("polls")

const tags = ["Polls"]

export const pollsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/polls",
      summary: "List polls",
      description:
        "Polls in this workspace, newest first, each with its total `votesCount`. Use this to find poll ids for `polls.get`, `polls.update`, `polls.getLinks` and `polls.getAnalytics`.",
      tags,
    })
    .input(listPollsPublicRequest)
    .output(listPollsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await pollOperations.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/polls/{id}",
      summary: "Get poll",
      description:
        "Returns one poll with its candidates; each candidate has its `votesCount`. Get the poll id from `polls.list`.",
      tags,
    })
    .input(pollIdRequest)
    .output(pollResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await pollOperations.get({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/polls",
      summary: "Create poll",
      description:
        "Creates a timed poll with 2 to 10 candidates. Dates are ISO 8601 strings; `endsAt` must be after `startsAt`. `afterVoteFlowId` is optional; get it from `flows.list`. Share it with `polls.getLinks`.",
      tags,
    })
    .input(pollFormRequest)
    .output(pollResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await pollOperations.create({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/polls/{id}",
      summary: "Update poll",
      description:
        "Changes the fields sent and leaves the rest; send at least one. When sending `candidates`, send a candidate's `id` (from `polls.get`) to keep it and its votes; candidates you omit are deleted together with their votes. Get the poll id from `polls.list`; `afterVoteFlowId` from `flows.list` (null clears it).",
      tags,
    })
    .input(updatePollPublicRequest)
    .output(pollResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...body } = input
      return await pollOperations.update({
        ...body,
        id,
        workspaceId: context.workspace.id,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/polls/{id}",
      summary: "Delete poll",
      description:
        "Permanently deletes the poll with its candidates and votes. Get the poll id from `polls.list`.",
      successStatus: 204,
      tags,
    })
    .input(pollIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await pollOperations.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  bulkDelete: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/polls/bulk-delete",
      summary: "Delete multiple polls",
      description:
        "Permanently deletes several polls with their candidates and votes. Get the poll ids from `polls.list`. Ids not in this workspace are ignored; the response says how many were deleted.",
      tags,
    })
    .input(pollBulkDeleteRequest)
    .output(bulkDeletePollsResponse)
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await pollOperations.bulkDelete({
          workspaceId: context.workspace.id,
          ids: input.ids,
        }),
    ),

  getLinks: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/polls/{id}/links",
      summary: "Get poll links",
      description:
        "Share links for a poll: `omnichannelUrl` (one link for every channel) plus one deep link per connected inbox on a channel that can vote (Messenger, Instagram, WhatsApp, Telegram, Webchat). Get the poll id from `polls.list`.",
      tags,
    })
    .input(pollIdRequest)
    .output(pollLinksResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await pollOperations.getLinks({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  getAnalytics: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/polls/{id}/analytics",
      summary: "Get poll analytics",
      description:
        "Vote totals, the male/female/unknown split and each candidate's votes and percentages. Get the poll id from `polls.list`.",
      tags,
    })
    .input(pollIdRequest)
    .output(pollAnalyticsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await pollOperations.getAnalytics({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),
}
