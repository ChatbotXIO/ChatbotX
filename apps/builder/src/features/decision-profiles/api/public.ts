import { decisionProfileService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingDecisionProfile,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingDecisionProfile,
} from "@/lib/orpc/orpc-error-helper"
import {
  publicListRequest,
  publicListResponse,
  withListPagingNote,
} from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  globalRouterDestinationsSchema,
  listGlobalRouterDestinations,
} from "../lib/list-global-router-destinations"
import { toPublicDecisionProfile } from "../lib/to-public-decision-profile"
import { publicDecisionProfileSchema } from "../schema/public"
import {
  deletePublicDecisionProfilesSchema,
  publicDecisionProfileActionSchema,
  publicDecisionProfileStatusSchema,
  publicDecisionProfileUpdateActionSchema,
} from "../schema/public-action"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const profileIdSchema = zodBigintAsString().describe(
  "AI Router profile id. Get it from `decisionProfiles.list`.",
)

export const decisionProfilesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/decision-profiles",
      summary: "List AI Router profiles",
      description: withListPagingNote(
        "Returns AI Router profiles in their full authoring shape. Use a profile id in a Flow Evaluate Decision step or with `decisionProfiles.get` and `decisionProfiles.update`.",
      ),
      tags: ["AI Router"],
    })
    .input(publicListRequest)
    .output(publicListResponse(publicDecisionProfileSchema))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await decisionProfileService.listForSettings({
        ...input,
        workspaceId: context.workspace.id,
      })
      return {
        ...result,
        data: result.data.map(toPublicDecisionProfile),
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/decision-profiles/{id}",
      summary: "Get AI Router profile",
      description:
        "Returns one AI Router profile's full authoring configuration. Use `decisionProfiles.list` to find its id first.",
      tags: ["AI Router"],
    })
    .input(z.object({ id: profileIdSchema }))
    .output(publicDecisionProfileSchema)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toPublicDecisionProfile(
        await decisionProfileService.getForEdit({
          ...input,
          workspaceId: context.workspace.id,
        }),
      ),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/decision-profiles",
      summary: "Create AI Router profile",
      description:
        "Creates a reusable AI Router profile. Create a connection first with `decisionConnections.create`; use `decisionProfiles.listGlobalRouterDestinations` for every id in `globalRouterConfig`.",
      successStatus: 201,
      tags: ["AI Router"],
    })
    .input(publicDecisionProfileActionSchema)
    .output(publicDecisionProfileSchema)
    .errors(possibleErrorsOnCreatingDecisionProfile)
    .handler(async ({ context, input }) =>
      toPublicDecisionProfile(
        await decisionProfileService.create({
          ...input,
          workspaceId: context.workspace.id,
        }),
      ),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/decision-profiles/{id}",
      summary: "Update AI Router profile",
      description:
        "Replaces an AI Router profile's configuration. Call `decisionProfiles.get` before changing it, and use `decisionProfiles.listGlobalRouterDestinations` for valid Global Router references.",
      tags: ["AI Router"],
    })
    .input(publicDecisionProfileUpdateActionSchema)
    .output(publicDecisionProfileSchema)
    .errors(possibleErrorsOnMutatingDecisionProfile)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return toPublicDecisionProfile(
        await decisionProfileService.update({
          ...data,
          id,
          workspaceId: context.workspace.id,
        }),
      )
    }),

  setEnabled: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/decision-profiles/{id}/status",
      summary: "Enable or disable AI Router profile",
      description:
        "Changes whether an AI Router profile is available to flows and the Global Router. Get the id from `decisionProfiles.list`.",
      tags: ["AI Router"],
    })
    .input(publicDecisionProfileStatusSchema.extend({ id: profileIdSchema }))
    .output(publicDecisionProfileSchema)
    .errors(possibleErrorsOnMutatingDecisionProfile)
    .handler(async ({ context, input }) =>
      toPublicDecisionProfile(
        await decisionProfileService.setEnabled({
          ...input,
          workspaceId: context.workspace.id,
        }),
      ),
    ),

  deleteMany: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/decision-profiles",
      summary: "Delete AI Router profiles",
      description:
        "Permanently deletes one or more AI Router profiles. Get ids from `decisionProfiles.list`.",
      successStatus: 204,
      tags: ["AI Router"],
    })
    .input(deletePublicDecisionProfilesSchema)
    .errors(possibleErrorsOnMutatingDecisionProfile)
    .handler(async ({ context, input }) => {
      await decisionProfileService.deleteMany({
        ...input,
        workspaceId: context.workspace.id,
      })
    }),

  listGlobalRouterDestinations: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/decision-profiles/global-router-destinations",
      summary: "List AI Router Global Router destinations",
      description:
        "Returns valid Flow, AI agent, user, team and custom-field references for `globalRouterConfig`. Flow ids are published flows only. Use these ids when creating or updating a profile with Global Router enabled.",
      tags: ["AI Router"],
    })
    .input(z.object({}))
    .output(globalRouterDestinationsSchema)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) =>
        await listGlobalRouterDestinations(context.workspace.id),
    ),
}
