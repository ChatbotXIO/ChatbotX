import { ecommerceOpenHoursService } from "@chatbotx.io/business"
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
  createOpenHoursPublicRequest,
  listOpenHoursPublicResponse,
  publicOpenHoursResource,
  updateOpenHoursPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

const RANGES_DESCRIPTION =
  "`ranges` are `{ day, from, to }`: day 0 (Sunday) to 6, times `HH:mm` in the workspace timezone; `to` earlier than `from` runs past midnight."

export const openHoursPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/open-hours",
      summary: "List open-hours schedules",
      description:
        "Named schedules the store (`ecommerceSettings.update` → `general.openHoursId`) and each vendor (`openHoursId`) can take orders in. No schedule means always open.",
      tags: ["Open Hours"],
    })
    .output(listOpenHoursPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => ({
      data: await ecommerceOpenHoursService.list(context.workspace.id),
    })),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/open-hours",
      summary: "Create open-hours schedule",
      description: RANGES_DESCRIPTION,
      tags: ["Open Hours"],
    })
    .input(createOpenHoursPublicRequest)
    .output(publicOpenHoursResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await ecommerceOpenHoursService.create({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/open-hours/{id}",
      summary: "Update open-hours schedule",
      description: `Changes the name or replaces the ranges. ${RANGES_DESCRIPTION}`,
      tags: ["Open Hours"],
    })
    .input(updateOpenHoursPublicRequest)
    .output(publicOpenHoursResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await ecommerceOpenHoursService.update({
        workspaceId: context.workspace.id,
        openHoursId: id,
        data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/open-hours/{id}",
      summary: "Delete open-hours schedule",
      description:
        "The store and vendors that used it become always open. Use `openHours.list` to find the id.",
      successStatus: 204,
      tags: ["Open Hours"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Open-hours schedule id. Get it from `openHours.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await ecommerceOpenHoursService.delete({
        workspaceId: context.workspace.id,
        openHoursId: input.id,
      })
    }),
}
