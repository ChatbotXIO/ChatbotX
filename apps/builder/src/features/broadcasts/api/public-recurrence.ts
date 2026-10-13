import { broadcastRecurrenceService } from "@chatbotx.io/business"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
  possibleErrorsOnReadingWithBody,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listBroadcastOccurrencesPublicRequest,
  listBroadcastOccurrencesPublicResponse,
  listBroadcastRunGroupsPublicRequest,
  listBroadcastRunGroupsPublicResponse,
  previewRecurrencePublicRequest,
  previewRecurrencePublicResponse,
  setBroadcastOccurrenceSkippedPublicRequest,
  setBroadcastOccurrenceSkippedPublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

/**
 * Repeating broadcasts beyond create/schedule: previews, history, and skipping
 * a run. The builder's private routes and actions call the same service
 * methods, so the UI and an agent see the same numbers.
 */
export const broadcastsRecurrencePublicRouter = {
  previewRecurrence: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/preview-recurrence",
      summary: "Preview repeat rule",
      description:
        "Returns the next run times of a repeat rule without creating anything, so you can check a schedule before `broadcasts.create` or `broadcasts.schedule`. Days 29-31 run on the last day of shorter months; a time that does not exist on a daylight-saving day moves forward, an ambiguous one takes the earlier instant.",
      tags: ["Broadcasts"],
    })
    .input(previewRecurrencePublicRequest)
    .output(previewRecurrencePublicResponse)
    .errors(possibleErrorsOnReadingWithBody)
    .handler(({ input }) =>
      broadcastRecurrenceService.previewUpcoming({
        rule: input.recurrence,
        count: input.count,
        now: new Date(),
      }),
    ),

  skipOccurrence: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/skip-occurrence",
      summary: "Skip repeating broadcast run",
      description:
        "Skips the run of a repeating broadcast on one local date (a holiday, a closure) without pausing the series: it keeps running and the skipped run is recorded as `skipped` with reason `excludedDate` in `broadcasts.listOccurrences`. Works on a running or paused series; 422 when the date has no run, or the run already started. Skipping a date twice is a no-op. Undo with `broadcasts.restoreOccurrence`; to skip many dates at once set `recurrence.excludeDates` through `broadcasts.moveToDraft` and `broadcasts.updateDraft`.",
      tags: ["Broadcasts"],
    })
    .input(setBroadcastOccurrenceSkippedPublicRequest)
    .output(setBroadcastOccurrenceSkippedPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(({ context, input }) =>
      broadcastRecurrenceService.setOccurrenceExcluded({
        workspaceId: context.workspace.id,
        idOrName: input.id,
        date: input.date,
        excluded: true,
      }),
    ),

  restoreOccurrence: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/restore-occurrence",
      summary: "Restore skipped repeating broadcast run",
      description:
        "Undoes `broadcasts.skipOccurrence`: the run on that local date sends again. 422 when the run already started or was already settled as skipped. Restoring a date that is not skipped is a no-op.",
      tags: ["Broadcasts"],
    })
    .input(setBroadcastOccurrenceSkippedPublicRequest)
    .output(setBroadcastOccurrenceSkippedPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(({ context, input }) =>
      broadcastRecurrenceService.setOccurrenceExcluded({
        workspaceId: context.workspace.id,
        idOrName: input.id,
        date: input.date,
        excluded: false,
      }),
    ),

  listRunGroups: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}/run-groups",
      summary: "List repeating broadcast runs by period",
      description:
        "Groups every scheduled slot of a repeating broadcast (`schedulesType: recurring`; a paused or finished one has status `cancelled` or `sent`) by local day, ISO week or month, newest first, with the recipient stats of the runs in each group. A day with no send is still a group, with the reason in `reasonCounts`. List one group's slots with `broadcasts.listOccurrences` (`from` = `periodStartAt`, `to` = `periodEndAt`), or its runs with `broadcasts.list` (`parentBroadcastId`, `scheduledFrom` = `periodStartAt`, `scheduledTo` = just before `periodEndAt`). Use the instants, not the local dates, which are read as UTC.",
      tags: ["Broadcasts"],
    })
    .input(listBroadcastRunGroupsPublicRequest)
    .output(listBroadcastRunGroupsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(({ context, input }) =>
      broadcastRecurrenceService.listRunGroups({
        workspaceId: context.workspace.id,
        idOrName: input.idOrName,
        granularity: input.groupBy,
        timezone: input.timezone,
        limit: input.limit,
        cursor: input.cursor,
      }),
    ),

  listOccurrences: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}/occurrences",
      summary: "List repeating broadcast slots",
      description:
        "Lists the slots of a repeating broadcast, newest first. Each slot says whether it became a run (`created`, with the run's id, status and stats), was deliberately not sent (`skipped`: paused, draft, blocked owner, plan limit, no pages, undeliverable, `excludedDate` for a date skipped with `broadcasts.skipOccurrence`) or was lost to an outage (`missed`). Use the run's id with `broadcasts.get`, `broadcasts.listContacts` or `broadcasts.resend` to retry a failed run.",
      tags: ["Broadcasts"],
    })
    .input(listBroadcastOccurrencesPublicRequest)
    .output(listBroadcastOccurrencesPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(({ context, input }) =>
      broadcastRecurrenceService.listOccurrences({
        workspaceId: context.workspace.id,
        idOrName: input.idOrName,
        from: input.from,
        to: input.to,
        limit: input.limit,
        cursor: input.cursor,
      }),
    ),
}
