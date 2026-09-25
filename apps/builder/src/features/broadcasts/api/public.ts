import { broadcastService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnActivatingBroadcast,
  possibleErrorsOnCreatingBroadcast,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createBroadcastRequest,
  resolveScheduleTime,
  resumeBroadcastSchema,
  scheduleBroadcastSchema,
  updateBroadcastSchema,
} from "../schema/action"
import {
  publicListBroadcastContactsRequest,
  publicListBroadcastContactsResponse,
} from "../schema/public"
import {
  listBroadcastAudienceResponse,
  publicListBroadcastsResponse,
} from "../schema/query"
import { publicBroadcastResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

// A workspace-token caller is a workspace-level credential mintable only by
// a superAdmin, so it is not subject to the member-level email/phone field
// permission the builder UI derives per-session — every public create/edit
// route treats the caller as fully privileged rather than silently pruning
// the audience filter it was given.
//
// This flag governs *write-side filter-condition pruning only*
// (`pruneEmailPhoneFilterConditions`, applied in `create`/`updateDraft`/
// `resendWithPruning`/`cloneBroadcast`). Reads are unaffected by it: `get`/
// `list`, and in particular `getAudience` below, already return full
// contact PII (email, phone, gender) for any `broadcasts`-scoped token —
// including a
// `read_only` one — because a superAdmin who can mint the token already has
// that PII in the builder UI. There is no field-level read gate to apply
// here without diverging from the private route this public route mirrors
// (invariant #9); see the "Broadcasts scope" table in
// `docs/developer/workspace-api-tokens.md` for the caller-facing writeup.
const TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE = true

export const broadcastsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts",
      summary: "List broadcasts",
      description:
        "Use this to find broadcasts by status before inspecting one with `broadcasts.get` or stopping one with `broadcasts.stop`. Returns newest broadcasts across every status.",
      tags: ["Broadcasts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(publicListRequest)
    .output(publicListBroadcastsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.list({
          workspaceId: context.workspace.id,
          ...input,
          sort: [{ id: "createdAt", desc: true }],
          name: null,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}",
      summary: "Get broadcast",
      description:
        "Use this to inspect a broadcast by id or name after finding it with `broadcasts.list`. Call `broadcasts.schedule` for a draft or `broadcasts.stop` for a sending broadcast.",
      tags: ["Broadcasts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        idOrName: z
          .string()
          .describe(
            "Broadcast id (numeric string) or exact name. Get it from `broadcasts.list`.",
          ),
      }),
    )
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.findByIdOrName({
          workspaceId: context.workspace.id,
          idOrName: input.idOrName,
        }),
    ),

  getAudience: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}/audience",
      summary: "Get broadcast audience",
      description:
        "Returns the paginated audience list a broadcast was or will be sent to. Use `broadcasts.get` to find its id or name first.",
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        idOrName: z
          .string()
          .describe(
            "Broadcast id (numeric string) or exact name. Get it from `broadcasts.list`.",
          ),
        page: z.coerce
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Page number, starting at 1."),
        perPage: z.coerce
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Number of items per page."),
      }),
    )
    .output(listBroadcastAudienceResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.listAudience({
          idOrName: input.idOrName,
          workspaceId: context.workspace.id,
          page: input.page,
          perPage: input.perPage,
        }),
    ),

  // Delivery stats already have a public route under the `analytics` scope
  // (`GET /v1/analytics/broadcasts/{broadcastId}/stats`, cached) — not
  // duplicated here.

  listContacts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{id}/contacts",
      summary: "List broadcast recipients by event type",
      description:
        "Returns contacts that reached one delivery event (e.g. sent, delivered, read, failed) for a broadcast.",
      tags: ["Broadcasts"],
    })
    .input(publicListBroadcastContactsRequest)
    .output(publicListBroadcastContactsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const { id, eventType, page, perPage } = input
      const { data, pageCount } = await broadcastService.listContactsPage({
        workspaceId: context.workspace.id,
        broadcastId: id,
        eventType,
        page,
        perPage,
      })

      // `conversationId` is a superset the public response schema doesn't
      // declare — zod strips it silently, so returning it here is harmless.
      return { data, pageCount }
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts",
      summary: "Create broadcast",
      description:
        "Starts a broadcast as a draft or scheduled send for the supplied audience. Use `broadcasts.list` to avoid duplicates, then use `broadcasts.schedule` to control its send time.",
      successStatus: 201,
      tags: ["Broadcasts"],
    })
    .input(createBroadcastRequest)
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnCreatingBroadcast)
    .handler(
      async ({ context, input }) =>
        await broadcastService.create({
          ...input,
          workspaceId: context.workspace.id,
          canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/broadcasts/{id}",
      summary: "Rename broadcast",
      description:
        "Changes a broadcast's name only. Use `broadcasts.updateDraft` to change a draft's full payload.",
      tags: ["Broadcasts"],
    })
    .input(
      updateBroadcastSchema.and(
        z.object({
          id: zodBigintAsString().describe(
            "Broadcast id. Get it from `broadcasts.list`.",
          ),
        }),
      ),
    )
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      await broadcastService.update(
        { workspaceId: context.workspace.id, id },
        data,
      )
      return await broadcastService.findByIdOrName({
        workspaceId: context.workspace.id,
        idOrName: id,
      })
    }),

  updateDraft: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/broadcasts/{id}/draft",
      summary: "Replace draft broadcast payload",
      description:
        "Replaces a draft's complete payload and can schedule it when `saveAsDraft` is false. Call `broadcasts.get` to inspect the draft first, or use `broadcasts.schedule` to keep its payload.",
      tags: ["Broadcasts"],
    })
    .input(
      createBroadcastRequest.and(
        z.object({
          id: zodBigintAsString().describe(
            "Broadcast id. Get it from `broadcasts.list`.",
          ),
        }),
      ),
    )
    // `status` is what tells the caller whether `saveAsDraft: false` actually
    // promoted the draft to `scheduled` — the service already computes it, so
    // declaring it here avoids a follow-up GET (zod strips undeclared keys
    // silently, so omitting it dropped the field from the response entirely).
    .output(z.object({ id: z.string(), status: broadcastStatuses }))
    .errors(possibleErrorsOnActivatingBroadcast)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await broadcastService.updateDraft({
        workspaceId: context.workspace.id,
        broadcastId: id,
        canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
        data,
      })
    }),

  schedule: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/schedule",
      summary: "Schedule draft broadcast",
      description:
        "Moves a draft broadcast to its scheduled state using the provided schedule. Call `broadcasts.get` to inspect it first, or use `broadcasts.updateDraft` to change its payload.",
      tags: ["Broadcasts"],
    })
    .input(
      scheduleBroadcastSchema.and(
        z.object({
          id: zodBigintAsString().describe(
            "Broadcast id. Get it from `broadcasts.list`.",
          ),
        }),
      ),
    )
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnActivatingBroadcast)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await broadcastService.scheduleDraft({
        workspaceId: context.workspace.id,
        broadcastId: id,
        schedulesType: data.schedulesType,
        schedulesAt: resolveScheduleTime(data),
        sendRatePerMinute: data.sendRatePerMinute,
      })
    }),

  moveToDraft: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/move-to-draft",
      summary: "Move scheduled broadcast back to draft",
      description:
        "Reverses a broadcast's `scheduled` state so its payload can be edited again. Only matches a broadcast whose status is `scheduled`; 404 otherwise. Use `broadcasts.updateDraft` afterward, or `broadcasts.schedule` to re-schedule.",
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Broadcast id. Get it from `broadcasts.list`.",
        ),
      }),
    )
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.moveToDraft({
          workspaceId: context.workspace.id,
          broadcastId: input.id,
        }),
    ),

  stop: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/stop",
      summary: "Stop broadcast",
      description:
        "Stops a broadcast only while it is sending and returns its id. Call `broadcasts.get` to confirm its state first, or use `broadcasts.moveToDraft` for scheduled broadcasts.",
      tags: ["Broadcasts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Broadcast id. Get it from `broadcasts.list`.",
        ),
      }),
    )
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.stopSending({
          workspaceId: context.workspace.id,
          broadcastId: input.id,
        }),
    ),

  resume: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/resume",
      summary: "Resume stopped broadcast",
      description:
        "Resumes sending a stopped broadcast where it left off. Only matches a broadcast whose status is `cancelled`; 404 otherwise. Use `broadcasts.stop` to pause a sending broadcast.",
      tags: ["Broadcasts"],
    })
    .input(
      resumeBroadcastSchema.and(
        z.object({
          id: zodBigintAsString().describe(
            "Broadcast id. Get it from `broadcasts.list`.",
          ),
        }),
      ),
    )
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnActivatingBroadcast)
    .handler(
      async ({ context, input }) =>
        await broadcastService.resumeSending({
          workspaceId: context.workspace.id,
          broadcastId: input.id,
          sendRatePerMinute: input.sendRatePerMinute,
        }),
    ),

  resend: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/resend",
      summary: "Resend sent or failed broadcast",
      description:
        "Clones a sent or failed broadcast into a new immediately-scheduled one. Only matches a broadcast whose status is sent or failed.",
      successStatus: 201,
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Broadcast id. Get it from `broadcasts.list`.",
        ),
      }),
    )
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnActivatingBroadcast)
    .handler(
      async ({ context, input }) =>
        await broadcastService.resendWithPruning({
          workspaceId: context.workspace.id,
          id: input.id,
          canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
        }),
    ),

  duplicate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/duplicate",
      summary: "Duplicate broadcast",
      description:
        "Copies the broadcast into a new draft with a deduplicated name, including its targets and audience filter.",
      successStatus: 201,
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Broadcast id. Get it from `broadcasts.list`.",
        ),
      }),
    )
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.cloneBroadcast({
          workspaceId: context.workspace.id,
          broadcastId: input.id,
          canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
        }),
    ),

  // Deprecated — use `broadcasts.duplicate` instead. Kept for backward
  // compatibility with the pre-consolidation `/clone` path; hidden from
  // MCP/CLI tool listings.
  clone: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/clone",
      summary: "Clone broadcast",
      description:
        "Deprecated — renamed to `broadcasts.duplicate` at `/duplicate`; this route does the same copy, kept only for callers still on the old path.",
      successStatus: 201,
      deprecated: true,
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Broadcast id. Get it from `broadcasts.list`.",
        ),
      }),
    )
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.cloneBroadcast({
          workspaceId: context.workspace.id,
          broadcastId: input.id,
          canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/broadcasts/{id}",
      summary: "Delete broadcast",
      description:
        "Soft-deletes the broadcast. A broadcast that is currently sending cannot be deleted.",
      successStatus: 204,
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Broadcast id. Get it from `broadcasts.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      // `softDeleteBroadcasts` is a bulk method: it reports skipped ids via
      // `deletedCount < requestedCount` rather than throwing, because a
      // partially-applied bulk delete is still a success. A single-id REST
      // DELETE is a different contract — returning 204 for an id that was
      // nonexistent, foreign, already deleted, or still `sending` would tell
      // the caller the broadcast is gone while it keeps delivering. Mirrors
      // `sequenceService.delete`'s `findOrFail` and the products route's
      // pre-delete existence check.
      const { deletedCount } = await broadcastService.softDeleteBroadcasts({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
      if (deletedCount === 0) {
        throw notFoundException("Broadcast not found or cannot be deleted")
      }
    }),
}
