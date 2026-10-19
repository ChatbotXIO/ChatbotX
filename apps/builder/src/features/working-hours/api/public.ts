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
import { toHolidayResource, toWorkingHoursResource } from "../lib/to-resource"
import {
  createHolidayRequest,
  createWorkingHoursRequest,
  setWorkingHoursMembersRequest,
  updateHolidayRequest,
  updateWorkingHoursRequest,
  workingHoursHolidayIdPathParam,
  workingHoursIdPathParam,
} from "../schema/action"
import {
  publicListHolidaysResponse,
  publicListWorkingHoursResponse,
} from "../schema/public"
import {
  workingHoursHolidayResource,
  workingHoursResource,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

const SEMANTICS =
  "Intervals are in the workspace timezone: `weekday` 0=Sunday..6=Saturday, `startMinute`/`endMinute` are minutes since local midnight, end-exclusive (`24:00` = 1440). A member belongs to at most one schedule. Reply-time analytics count only time inside the replying agent's schedule; agents without a schedule are measured on wall-clock time. A date can override the weekly intervals: first the schedule's own `dateOverrides`, then the workspace-wide holidays (`workingHours.listHolidays`); `ranges: []` means closed all day."

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
      return paginateInMemory(
        rows.map((row) => toWorkingHoursResource(row)),
        input,
      )
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/working-hours/{id}",
      summary: "Get working-hours schedule",
      description: `Returns one schedule with its intervals, date overrides and member user ids. Get the id from \`workingHours.list\`. ${SEMANTICS}`,
      tags: ["Working Hours"],
    })
    .input(workingHoursIdPathParam)
    .output(workingHoursResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const [row, dateOverrides] = await Promise.all([
        workingHoursService.findByIdOrFail({
          workspaceId,
          workingHoursId: input.id,
        }),
        workingHoursService.listDateOverrides({
          workspaceId,
          workingHoursId: input.id,
        }),
      ])
      return toWorkingHoursResource(row, dateOverrides)
    }),

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
      description: `Renames a schedule and/or replaces its intervals and date overrides. Omitted fields are unchanged; \`intervals\` and \`dateOverrides\`, when sent, FULLY replace the weekly intervals / the date overrides (max 400). Get the id from \`workingHours.list\`; use \`workingHours.setMembers\` to change members. Invalid intervals (overlap, out of bounds, more than 10 per weekday or 70 in total) are rejected as a 422 \`invalidRequestData\` error. Sending none of \`name\`, \`intervals\` or \`dateOverrides\` is also a 422 \`invalidRequestData\`. ${SEMANTICS}`,
      tags: ["Working Hours"],
    })
    .input(updateWorkingHoursRequest.and(workingHoursIdPathParam))
    .output(workingHoursResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      const { id, ...data } = input
      const workspaceId = context.workspace.id
      const row = await workingHoursService.update({
        workspaceId,
        workingHoursId: id,
        data,
      })
      return toWorkingHoursResource(
        row,
        await workingHoursService.listDateOverrides({
          workspaceId,
          workingHoursId: id,
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

  listHolidays: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/working-hours-holidays",
      summary: "List workspace holidays",
      description: `Workspace-wide holidays (dates that replace the weekly intervals of EVERY schedule), by date. A schedule's own \`dateOverrides\` win over a holiday. ${SEMANTICS}`,
      tags: ["Working Hours"],
    })
    .input(publicListRequest)
    .output(publicListHolidaysResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const rows = await workingHoursService.listDateOverrides({
        workspaceId: context.workspace.id,
        workingHoursId: null,
      })
      return paginateInMemory(rows.map(toHolidayResource), input)
    }),

  createHoliday: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/working-hours-holidays",
      summary: "Create workspace holiday",
      description: `Adds a workspace-wide holiday for one local date: \`ranges: []\` closes the day for every schedule, ranges replace the weekly intervals (e.g. shortened hours). One holiday per date, at most 400; a duplicate date or an invalid date/range is a 422. ${SEMANTICS}`,
      successStatus: 201,
      tags: ["Working Hours"],
    })
    .input(createHolidayRequest)
    .output(workingHoursHolidayResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      return toHolidayResource(
        await workingHoursService.addHoliday({
          workspaceId: context.workspace.id,
          data: input,
        }),
      )
    }),

  updateHoliday: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/working-hours-holidays/{id}",
      summary: "Update workspace holiday",
      description: `Changes a holiday's name and/or FULLY replaces its ranges (the date cannot change: delete and create to move it). Get the id from \`workingHours.listHolidays\`. ${SEMANTICS}`,
      tags: ["Working Hours"],
    })
    .input(updateHolidayRequest.and(workingHoursHolidayIdPathParam))
    .output(workingHoursHolidayResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      const { id, ...data } = input
      return toHolidayResource(
        await workingHoursService.updateHoliday({
          workspaceId: context.workspace.id,
          id,
          data,
        }),
      )
    }),

  deleteHoliday: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/working-hours-holidays/{id}",
      summary: "Delete workspace holiday",
      description:
        "Permanently deletes a holiday; the weekly intervals apply to that date again. Get the id from `workingHours.listHolidays`.",
      successStatus: 204,
      tags: ["Working Hours"],
    })
    .input(workingHoursHolidayIdPathParam)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await workingHoursService.deleteHoliday({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
