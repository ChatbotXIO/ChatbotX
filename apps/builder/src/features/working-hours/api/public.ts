import { workingHoursService } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { paginateInMemory, publicListRequest } from "@/lib/public-api/list"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { toWorkingHoursResource } from "../lib/to-resource"
import {
  createWorkingHoursRequest,
  setWorkingHoursMembersRequest,
  updateWorkingHoursRequest,
  workingHoursIdPathParam,
} from "../schema/action"
import { publicListWorkingHoursResponse } from "../schema/public"
import { workingHoursResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

const SEMANTICS =
  "Intervals are in the workspace timezone: `weekday` 0=Sunday..6=Saturday, `startMinute`/`endMinute` are minutes since local midnight, end-exclusive (`24:00` = 1440). A member belongs to at most one schedule. Reply-time analytics count only time inside the replying agent's schedule; agents without a schedule are measured on wall-clock time."

export const workingHoursPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/working-hours",
      summary: "List working-hours schedules",
      description: `Use this to find working-hours ids before inspecting or changing one. Returns every schedule with its intervals and member user ids. ${SEMANTICS}`,
      tags: ["Working Hours"],
    })
    .input(publicListRequest)
    .output(publicListWorkingHoursResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const rows = await workingHoursService.listByWorkspace({
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(rows.map(toWorkingHoursResource), input)
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/working-hours/{id}",
      summary: "Get working-hours schedule",
      description: `Returns one schedule with its intervals and member user ids. Get the id from \`workingHours.list\`. ${SEMANTICS}`,
      tags: ["Working Hours"],
    })
    .input(workingHoursIdPathParam)
    .output(workingHoursResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toWorkingHoursResource(
        await workingHoursService.findByIdOrFail({
          workspaceId: context.workspace.id,
          workingHoursId: input.id,
        }),
      ),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/working-hours",
      summary: "Create working-hours schedule",
      description: `Creates a schedule, optionally with intervals and members. Member user ids come from \`workspaceMembers.list\`; members already on another schedule are moved here. Invalid intervals (overlap, out of bounds, more than 10 per weekday or 70 in total) are rejected as a 422 \`invalidRequestData\` error; non-member user ids, or more than 1000 user ids, fail with a 422 \`validation\` / \`invalidRequestData\` error respectively. ${SEMANTICS}`,
      successStatus: 201,
      tags: ["Working Hours"],
    })
    .input(createWorkingHoursRequest)
    .output(workingHoursResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      return toWorkingHoursResource(
        await workingHoursService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
      )
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/working-hours/{id}",
      summary: "Update working-hours schedule",
      description: `Renames a schedule and/or replaces its intervals. Omitted fields are unchanged; \`intervals\`, when sent, FULLY replaces the weekly intervals. Get the id from \`workingHours.list\`; use \`workingHours.setMembers\` to change members. Invalid intervals (overlap, out of bounds, more than 10 per weekday or 70 in total) are rejected as a 422 \`invalidRequestData\` error. Sending neither \`name\` nor \`intervals\` is also a 422 \`invalidRequestData\`. ${SEMANTICS}`,
      tags: ["Working Hours"],
    })
    .input(updateWorkingHoursRequest.and(workingHoursIdPathParam))
    .output(workingHoursResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      const { id, ...data } = input
      return toWorkingHoursResource(
        await workingHoursService.update({
          workspaceId: context.workspace.id,
          workingHoursId: id,
          data,
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/working-hours/{id}",
      summary: "Delete working-hours schedule",
      description:
        "Permanently deletes a schedule; its members are left without a schedule and are measured on wall-clock time again. Get the id from `workingHours.list`.",
      successStatus: 204,
      tags: ["Working Hours"],
    })
    .input(workingHoursIdPathParam)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await workingHoursService.delete({
        workspaceId: context.workspace.id,
        workingHoursId: input.id,
      })
    }),

  setMembers: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/working-hours/{id}/members",
      summary: "Set working-hours members",
      description: `FULLY replaces the members of a schedule with \`userIds\` (empty array removes all). User ids come from \`workspaceMembers.list\`; a user already on another schedule is moved here, because a member has at most one schedule. Non-member user ids fail with a 422 \`validation\` error; more than 1000 user ids is a 422 \`invalidRequestData\`. Get the id from \`workingHours.list\`. ${SEMANTICS}`,
      tags: ["Working Hours"],
    })
    .input(setWorkingHoursMembersRequest.and(workingHoursIdPathParam))
    .output(workingHoursResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      return toWorkingHoursResource(
        await workingHoursService.replaceMembers({
          workspaceId: context.workspace.id,
          workingHoursId: input.id,
          userIds: input.userIds,
        }),
      )
    }),
}
