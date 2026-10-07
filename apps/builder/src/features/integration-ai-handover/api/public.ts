import {
  aiHandoverBulkRunService,
  aiHandoverSettingsService,
} from "@chatbotx.io/business"
import { validationException } from "@chatbotx.io/business/errors"
import {
  possibleErrorsOnApplyingAiHandover,
  possibleErrorsOnFindingResource,
} from "@/lib/orpc/orpc-error-helper"
import { withListPagingNote } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { toApplyToAllStatus, toBulkRunResource } from "../lib/bulk-run-resource"
import { listAiHandoverBulkHistoryResponse } from "../schema/bulk"
import {
  aiHandoverInboxIdParam,
  aiHandoverSettingsResource,
  aiHandoverSettingsWithStatusResource,
  listAiHandoverHistoryPublicRequest,
  patchAiHandoverSettingsPublicRequest,
  saveAiHandoverSettingsPublicRequest,
  setApplyToAllPublicRequest,
  setApplyToAllPublicResponse,
} from "../schema/public"

// These routes can message and hand over real customers, so they sit under the
// `integrations` scope (settings of a connected channel) and `setApplyToAll`
// is bounded by a dry-run count and an explicit `confirmCount`.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

const toSettingsResource = (
  settings: Awaited<ReturnType<typeof aiHandoverSettingsService.find>>,
) => ({
  enabled: settings?.enabled ?? false,
  scheduleEnabled: settings?.scheduleEnabled ?? false,
  timeRanges: settings?.timeRanges ?? [],
  gotoFlowId: settings?.gotoFlowId ?? null,
  returnMessage: settings?.returnMessage ?? null,
  pauseBotWaitingForStaff: settings?.pauseBotWaitingForStaff ?? false,
})

export const aiHandoverPublicRouter = {
  getSettings: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inboxes/{inboxId}/ai-handover/settings",
      summary: "Get AI hand-over settings and status",
      description:
        "Returns a Messenger Page's Meta Business AI hand-over settings (the master switch, optional schedule, the flow or message used when the AI hands a conversation back) and, in `applyToAll`, whether the Page is set to hand every customer to the AI, whether the automation is running now and the latest run's status (counts, errors, pause). A Page that never configured it returns the defaults (everything off). Poll it after `aiHandover.setApplyToAll`. Find the Page with `inboxes.list`.",
      tags: ["Integrations"],
    })
    .input(aiHandoverInboxIdParam)
    .output(aiHandoverSettingsWithStatusResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const ref = { workspaceId: context.workspace.id, inboxId: input.inboxId }
      await aiHandoverSettingsService.requireInbox(ref)
      const [settings, state, activeSettings] = await Promise.all([
        aiHandoverSettingsService.find(ref),
        aiHandoverBulkRunService.findStatus(ref),
        aiHandoverSettingsService.findActive(ref),
      ])
      return {
        ...toSettingsResource(settings),
        applyToAll: toApplyToAllStatus(state, activeSettings !== null),
      }
    }),

  saveSettings: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/inboxes/{inboxId}/ai-handover/settings",
      summary: "Save AI hand-over settings",
      description:
        "Replaces a Page's Meta Business AI hand-over settings. Saving `enabled: false` also stops a running apply-to-all enable. `gotoFlowId` must be an active flow of this workspace (`flows.list`); a schedule needs at least one time range. This does not hand over any customer by itself; see `aiHandover.setApplyToAll`.",
      tags: ["Integrations"],
    })
    .input(saveAiHandoverSettingsPublicRequest)
    .output(aiHandoverSettingsResource)
    .errors(possibleErrorsOnApplyingAiHandover)
    .handler(async ({ context, input }) => {
      const { inboxId, ...settings } = input
      return toSettingsResource(
        await aiHandoverBulkRunService.saveSettings({
          ...settings,
          workspaceId: context.workspace.id,
          inboxId,
        }),
      )
    }),

  patchSettings: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/inboxes/{inboxId}/ai-handover/settings",
      summary: "Update AI hand-over settings",
      description:
        'Changes only the AI hand-over settings you send and keeps the others as saved, e.g. `{"enabled": false}`. Same rules as `aiHandover.saveSettings`: saving `enabled: false` also stops a running apply-to-all enable, `gotoFlowId` must be an active flow of this workspace and a schedule needs at least one time range.',
      tags: ["Integrations"],
    })
    .input(patchAiHandoverSettingsPublicRequest)
    .output(aiHandoverSettingsResource)
    .errors(possibleErrorsOnApplyingAiHandover)
    .handler(async ({ context, input }) => {
      const { inboxId, ...changes } = input
      const ref = { workspaceId: context.workspace.id, inboxId }
      await aiHandoverSettingsService.requireInbox(ref)
      const merged = {
        ...toSettingsResource(await aiHandoverSettingsService.find(ref)),
        ...Object.fromEntries(
          Object.entries(changes).filter(([, value]) => value !== undefined),
        ),
      }
      if (merged.scheduleEnabled && merged.timeRanges.length === 0) {
        throw validationException(
          "timeRanges",
          "A schedule needs at least one time range",
        )
      }
      return toSettingsResource(
        await aiHandoverBulkRunService.saveSettings({ ...merged, ...ref }),
      )
    }),

  setApplyToAll: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/inboxes/{inboxId}/ai-handover/apply-to-all",
      summary: "Set AI hand-over apply-to-all",
      description:
        "Moves a Page's `applyToAllCustomers` switch: ON hands every eligible customer thread to Meta Business AI (the Page's automation must be running), OFF takes them back and sends `message` (required) with the HUMAN_AGENT tag. This messages real customers. First call with `dryRun: true` to get `eligibleCount`, then call again with `confirmCount` set to the most customers you accept; it is refused when more are eligible at that moment or when the change cannot start immediately (a previous run is still winding down). It is a check at request time, not a cap: customers who become eligible while the run progresses are still included. Track progress with `aiHandover.getSettings` (`applyToAll`).",
      tags: ["Integrations"],
    })
    .input(setApplyToAllPublicRequest)
    .output(setApplyToAllPublicResponse)
    .errors(possibleErrorsOnApplyingAiHandover)
    .handler(async ({ context, input }) => {
      const request = {
        workspaceId: context.workspace.id,
        inboxId: input.inboxId,
        applyToAllCustomers: input.applyToAllCustomers,
        message: input.message ?? null,
      }
      if (input.dryRun) {
        const preview =
          await aiHandoverBulkRunService.previewApplyToAll(request)
        return { dryRun: true, run: null, ...preview }
      }
      const change = await aiHandoverBulkRunService.setApplyToAll({
        ...request,
        userId: null,
        confirmMaxEligible: input.confirmCount,
      })
      return {
        dryRun: false,
        isChanged: change.isChanged,
        eligibleCount: null,
        run: change.run ? toBulkRunResource(change.run) : null,
      }
    }),

  retryApplyToAll: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/inboxes/{inboxId}/ai-handover/apply-to-all/retry",
      summary: "Retry AI hand-over apply-to-all",
      description:
        "Starts the latest apply-to-all request again after its run failed or was stopped, with the same desired state and message that were already requested (no new confirmation is needed). Refused while a run is live or after it completed.",
      tags: ["Integrations"],
    })
    .input(aiHandoverInboxIdParam)
    .output(setApplyToAllPublicResponse)
    .errors(possibleErrorsOnApplyingAiHandover)
    .handler(async ({ context, input }) => {
      const change = await aiHandoverBulkRunService.retry({
        workspaceId: context.workspace.id,
        inboxId: input.inboxId,
        userId: null,
      })
      return {
        dryRun: false,
        isChanged: change.isChanged,
        eligibleCount: null,
        run: change.run ? toBulkRunResource(change.run) : null,
      }
    }),

  listHistory: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inboxes/{inboxId}/ai-handover/history",
      summary: "List AI hand-over apply-to-all runs",
      description: withListPagingNote(
        "Lists a Page's apply-to-all runs, newest first, with their status and counts.",
      ),
      tags: ["Integrations"],
    })
    .input(listAiHandoverHistoryPublicRequest)
    .output(listAiHandoverBulkHistoryResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const ref = { workspaceId: context.workspace.id, inboxId: input.inboxId }
      await aiHandoverSettingsService.requireInbox(ref)
      const { data, pageCount } = await aiHandoverBulkRunService.listHistory({
        ...ref,
        page: input.page,
        perPage: input.perPage,
      })
      return {
        data: data.map((run) => toBulkRunResource(run, run.requestedBy)),
        pageCount,
      }
    }),
}
