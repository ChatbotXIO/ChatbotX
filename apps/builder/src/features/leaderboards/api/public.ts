import {
  getLeaderboardTop,
  leaderboardParticipantService,
  leaderboardService,
  listTelegramLeaderboardChats,
  signLeaderboardViewTokenForContact,
  triggerLeaderboardRewards,
} from "@chatbotx.io/business/leaderboard"
import { uploader } from "@chatbotx.io/filesystem"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingLeaderboard,
  possibleErrorsOnTriggeringLeaderboardRewards,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { toLeaderboardResource } from "../lib/to-resource"
import { buildLeaderboardViewUrl } from "../lib/view-url"
import {
  adjustLeaderboardScoreRequest,
  leaderboardContactInput,
  leaderboardIdInput,
  leaderboardReasonRequest,
  resetLeaderboardPointsRequest,
} from "../schema/action"
import {
  createLeaderboardPublicRequest,
  defaultLeaderboardRulesRequest,
  leaderboardExportResponse,
  leaderboardExportStatusResponse,
  leaderboardHistoryResponse,
  leaderboardRewardsResponse,
  leaderboardTopRequest,
  leaderboardTopResponse,
  leaderboardViewLinkRequest,
  leaderboardViewLinkResponse,
  listLeaderboardAuditLogPublicRequest,
  listLeaderboardAuditLogPublicResponse,
  listLeaderboardParticipantsPublicRequest,
  listLeaderboardParticipantsPublicResponse,
  listLeaderboardsPublicRequest,
  listLeaderboardsPublicResponse,
  updateLeaderboardPublicRequest,
} from "../schema/public"
import { leaderboardResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("leaderboards")

const tags = ["Leaderboards"]

const ID_HINT = "Get leaderboard ids from `leaderboards.list`."

const statusRoute = (
  action: "publish" | "pause" | "start" | "finish",
  summary: string,
  description: string,
) =>
  workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: `/v1/leaderboards/{id}/${action}`,
      summary,
      description: `${description} ${ID_HINT}`,
      tags,
    })
    .input(leaderboardIdInput)
    .output(leaderboardResource)
    .errors(possibleErrorsOnMutatingLeaderboard)
    .handler(async ({ context, input }) =>
      toLeaderboardResource(
        await leaderboardService[action]({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    )

export const leaderboardsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/leaderboards",
      summary: "List leaderboards",
      description:
        "Lists ranking campaigns with live participant/point counters and per-status totals. Use it to find leaderboard ids for every other `leaderboards.*` operation. Returns `{ data, pageCount }`; page with `page`/`perPage`.",
      tags,
    })
    .input(listLeaderboardsPublicRequest)
    .output(listLeaderboardsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await leaderboardService.list({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { ...result, data: result.data.map(toLeaderboardResource) }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/leaderboards/{id}",
      summary: "Get leaderboard",
      description: `Returns one leaderboard's configuration, status, live counters, allowed actions and public link. ${ID_HINT}`,
      tags,
    })
    .input(leaderboardIdInput)
    .output(leaderboardResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toLeaderboardResource(
        await leaderboardService.find({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    ),

  defaultRules: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/leaderboards/default-rules",
      summary: "Get default scoring rules",
      description:
        "Returns the recommended scoring rules for a platform (e.g. 30 points per Facebook comment, 30-character minimum). Start `leaderboards.create`'s `rules` from this.",
      tags,
    })
    .input(defaultLeaderboardRulesRequest)
    .output(z.object({ rules: leaderboardResource.shape.rules }))
    .errors(possibleErrorsOnListingResource)
    .handler(({ input }) => ({
      rules: leaderboardService.defaultRules(input.platform),
    })),

  telegramChats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/leaderboards/telegram-chats",
      summary: "List Telegram groups for leaderboards",
      description:
        "Returns the groups/channels where a Telegram inbox's bot is an admin — the values for `scope.telegramChatIds` on a telegram leaderboard. Get inboxId from `inboxes.list`. A group appears after the bot is added to it as an admin.",
      tags,
    })
    .input(
      z.object({
        inboxId: z
          .string()
          .describe("Telegram inbox id. Get it from `inboxes.list`."),
      }),
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            chatId: z.string(),
            title: z.string().nullable(),
            type: z.string(),
          }),
        ),
      }),
    )
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => ({
      data: await listTelegramLeaderboardChats({
        workspaceId: context.workspace.id,
        inboxId: input.inboxId,
      }),
    })),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/leaderboards",
      summary: "Create leaderboard",
      description:
        "Creates a ranking campaign as a draft; when referral is enabled and no referralWelcomeFlowId is given, a welcome flow (text with {{referral_name}} + a button to the public page) is created and linked. Get the host channel id from `inboxes.list` (or the minigame id from `minigames.list` for gamification) and start `rules` from `leaderboards.defaultRules`; then call `leaderboards.publish` to start scoring.",
      successStatus: 201,
      tags,
    })
    .input(createLeaderboardPublicRequest)
    .output(leaderboardResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) =>
      toLeaderboardResource(
        await leaderboardService.create(
          { ...input, workspaceId: context.workspace.id },
          { buildViewUrl: (id) => buildLeaderboardViewUrl(id) },
        ),
      ),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/leaderboards/{id}",
      summary: "Update leaderboard",
      description: `Replaces a leaderboard's configuration. Platform, channel and start time are fixed once published; finished leaderboards cannot be edited. Call \`leaderboards.get\` first. ${ID_HINT}`,
      tags,
    })
    .input(updateLeaderboardPublicRequest)
    .output(leaderboardResource)
    .errors(possibleErrorsOnMutatingLeaderboard)
    .handler(async ({ context, input }) =>
      toLeaderboardResource(
        await leaderboardService.update({
          ...input,
          workspaceId: context.workspace.id,
        }),
      ),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/leaderboards/{id}",
      summary: "Delete leaderboard",
      description: `Deletes a draft, paused or finished leaderboard (an active one must be paused or finished first). ${ID_HINT}`,
      successStatus: 204,
      tags,
    })
    .input(leaderboardIdInput)
    .errors(possibleErrorsOnMutatingLeaderboard)
    .handler(async ({ context, input }) => {
      await leaderboardService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  publish: statusRoute(
    "publish",
    "Publish leaderboard",
    "Moves a draft to active so it starts scoring. Needs at least one enabled rule and an end time in the future.",
  ),
  pause: statusRoute(
    "pause",
    "Pause leaderboard",
    "Stops automatic and flow scoring; admins can still adjust scores manually.",
  ),
  start: statusRoute(
    "start",
    "Resume leaderboard",
    "Resumes scoring on a paused leaderboard.",
  ),
  finish: statusRoute(
    "finish",
    "Finish leaderboard",
    "Freezes every score now (it also happens automatically at the end time) and sends rewards when automatic rewards are on.",
  ),

  resetPoints: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/leaderboards/{id}/reset-points",
      summary: "Reset all points",
      description: `Danger: sets every participant's score of an active leaderboard to 0. Logged in the audit log. ${ID_HINT}`,
      tags,
    })
    .input(resetLeaderboardPointsRequest)
    .output(z.object({ reset: z.number() }))
    .errors(possibleErrorsOnMutatingLeaderboard)
    .handler(
      async ({ context, input }) =>
        await leaderboardService.resetPoints({
          workspaceId: context.workspace.id,
          id: input.id,
          actorUserId: null,
          reason: input.reason,
        }),
    ),

  top: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/leaderboards/{id}/top",
      summary: "Get top ranking",
      description: `Returns the current top N participants (rank, contact, score, name). Banned participants are excluded. ${ID_HINT}`,
      tags,
    })
    .input(leaderboardTopRequest)
    .output(leaderboardTopResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      data: await getLeaderboardTop({
        workspaceId: context.workspace.id,
        leaderboardId: input.id,
        limit: input.limit,
      }),
    })),

  getViewLink: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/leaderboards/{id}/view-link",
      summary: "Get public leaderboard link",
      description: `Returns the public leaderboard page URL. Without \`contactId\` the URL holds \`{{leaderboard_view_token}}\`, which a flow fills per contact; with \`contactId\` (from \`contacts.list\`) it is already signed for that contact. ${ID_HINT}`,
      tags,
    })
    .input(leaderboardViewLinkRequest)
    .output(leaderboardViewLinkResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const leaderboard = await leaderboardService.find({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      if (!input.contactId) {
        return {
          url: buildLeaderboardViewUrl(leaderboard.id),
          personalized: false,
        }
      }
      const token = await signLeaderboardViewTokenForContact({
        leaderboard,
        contactId: input.contactId,
      })
      return token
        ? {
            url: buildLeaderboardViewUrl(leaderboard.id, token),
            personalized: true,
          }
        : { url: buildLeaderboardViewUrl(leaderboard.id), personalized: false }
    }),

  export: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/leaderboards/{id}/export",
      summary: "Export participants to CSV",
      description: `Queues a CSV of every participant (rank order, banned last). Poll \`leaderboards.getExport\` with the returned fileId until status is uploaded, then use downloadUrl. ${ID_HINT}`,
      successStatus: 201,
      tags,
    })
    .input(leaderboardIdInput)
    .output(leaderboardExportResponse)
    .errors(possibleErrorsOnMutatingLeaderboard)
    .handler(
      async ({ context, input }) =>
        await leaderboardService.createExport({
          workspaceId: context.workspace.id,
          id: input.id,
          userId: context.workspace.ownerId,
          // Phone/email only for tokens that may read contacts (null = all scopes).
          includeContactInfo:
            !context.apiToken?.scopes ||
            context.apiToken.scopes.includes("contacts"),
        }),
    ),

  getExport: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/leaderboards/exports/{fileId}",
      summary: "Get participants export status",
      description:
        "Returns a CSV export's progress; downloadUrl is set once status is uploaded. Get fileId from `leaderboards.export`.",
      tags,
    })
    .input(
      z.object({ fileId: z.string().describe("From `leaderboards.export`.") }),
    )
    .output(leaderboardExportStatusResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const file = await leaderboardService.getExport({
        workspaceId: context.workspace.id,
        fileId: input.fileId,
      })
      return {
        ...file,
        downloadUrl:
          file.status === "uploaded"
            ? await uploader.getPresignedDownload(file.path, 5 * 60)
            : null,
      }
    }),

  triggerRewards: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/leaderboards/{id}/trigger-rewards",
      summary: "Send rewards to top winners",
      description: `Starts the reward flow (rewardSettings.flowId) for the top N of a finished leaderboard. Runs once; returns who was messaged. ${ID_HINT}`,
      tags,
    })
    .input(leaderboardIdInput)
    .output(leaderboardRewardsResponse)
    .errors(possibleErrorsOnTriggeringLeaderboardRewards)
    .handler(
      async ({ context, input }) =>
        await triggerLeaderboardRewards({
          workspaceId: context.workspace.id,
          leaderboardId: input.id,
          retryFailedInBackground: true,
        }),
    ),

  participants: {
    list: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/leaderboards/{id}/participants",
        summary: "List participants",
        description: `Returns each participant's rank, score, per-rule breakdown and last activity; search by name/phone/contact id or filter Top 10/Top 50/banned. ${ID_HINT} Returns \`{ data, pageCount }\`.`,
        tags,
      })
      .input(listLeaderboardParticipantsPublicRequest)
      .output(listLeaderboardParticipantsPublicResponse)
      .errors(possibleErrorsOnFindingResource)
      .handler(
        async ({ context, input }) =>
          await leaderboardParticipantService.list({
            workspaceId: context.workspace.id,
            leaderboardId: input.id,
            keyword: input.keyword,
            filter: input.filter,
            page: input.page,
            perPage: input.perPage,
          }),
      ),

    adjust: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/leaderboards/{id}/participants/{contactId}/adjust",
        summary: "Adjust participant score",
        description:
          "Adds or subtracts points by hand (reason required, kept in the audit log). Allowed while active or paused. Get contactId from `leaderboards.participants.list`.",
        tags,
      })
      .input(adjustLeaderboardScoreRequest)
      .output(z.object({ score: z.number() }))
      .errors(possibleErrorsOnMutatingLeaderboard)
      .handler(
        async ({ context, input }) =>
          await leaderboardParticipantService.adjust({
            workspaceId: context.workspace.id,
            leaderboardId: input.id,
            contactId: input.contactId,
            delta: input.delta,
            reason: input.reason,
            actorUserId: null,
          }),
      ),

    ban: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/leaderboards/{id}/participants/{contactId}/ban",
        summary: "Ban participant",
        description:
          "Removes a participant from the ranking and stops them scoring (anti-cheat). Get contactId from `leaderboards.participants.list`.",
        tags,
      })
      .input(leaderboardReasonRequest)
      .output(z.object({ ok: z.literal(true) }))
      .errors(possibleErrorsOnMutatingLeaderboard)
      .handler(async ({ context, input }) => {
        await leaderboardParticipantService.setBanned({
          workspaceId: context.workspace.id,
          leaderboardId: input.id,
          contactId: input.contactId,
          isBanned: true,
          reason: input.reason,
          actorUserId: null,
        })
        return { ok: true as const }
      }),

    unban: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/leaderboards/{id}/participants/{contactId}/unban",
        summary: "Unban participant",
        description:
          "Puts a banned participant back in the ranking. Get contactId from `leaderboards.participants.list` (filter banned).",
        tags,
      })
      .input(leaderboardReasonRequest)
      .output(z.object({ ok: z.literal(true) }))
      .errors(possibleErrorsOnMutatingLeaderboard)
      .handler(async ({ context, input }) => {
        await leaderboardParticipantService.setBanned({
          workspaceId: context.workspace.id,
          leaderboardId: input.id,
          contactId: input.contactId,
          isBanned: false,
          reason: input.reason,
          actorUserId: null,
        })
        return { ok: true as const }
      }),

    reset: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/leaderboards/{id}/participants/{contactId}/reset",
        summary: "Reset participant score",
        description:
          "Sets one participant's score to 0 (logged in the audit log). Get contactId from `leaderboards.participants.list`.",
        tags,
      })
      .input(leaderboardReasonRequest)
      .output(z.object({ score: z.number() }))
      .errors(possibleErrorsOnMutatingLeaderboard)
      .handler(
        async ({ context, input }) =>
          await leaderboardParticipantService.resetOne({
            workspaceId: context.workspace.id,
            leaderboardId: input.id,
            contactId: input.contactId,
            reason: input.reason,
            actorUserId: null,
          }),
      ),

    history: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/leaderboards/{id}/participants/{contactId}/history",
        summary: "Get participant score history",
        description:
          "Every score change of one participant during the campaign (newest first) — use it to investigate cheating. Get contactId from `leaderboards.participants.list`.",
        tags,
      })
      .input(leaderboardContactInput)
      .output(leaderboardHistoryResponse)
      .errors(possibleErrorsOnFindingResource)
      .handler(async ({ context, input }) => ({
        data: await leaderboardParticipantService.history({
          workspaceId: context.workspace.id,
          leaderboardId: input.id,
          contactId: input.contactId,
        }),
      })),
  },

  auditLog: {
    list: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/leaderboards/{id}/audit-log",
        summary: "List score audit log",
        description: `Immutable log of manual adjustments, resets and bans (who, how much, when, why). ${ID_HINT} Returns \`{ data, pageCount }\`.`,
        tags,
      })
      .input(listLeaderboardAuditLogPublicRequest)
      .output(listLeaderboardAuditLogPublicResponse)
      .errors(possibleErrorsOnFindingResource)
      .handler(
        async ({ context, input }) =>
          await leaderboardParticipantService.auditLog({
            workspaceId: context.workspace.id,
            leaderboardId: input.id,
            page: input.page,
            perPage: input.perPage,
          }),
      ),
  },
}
