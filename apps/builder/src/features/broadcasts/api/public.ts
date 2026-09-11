import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import { broadcastService, contactInboxService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { mapBroadcastContactRow } from "../lib/map-broadcast-contact-row"
import { listBroadcastAudience, listBroadcasts } from "../queries"
import {
  createBroadcastRequest,
  resolveScheduleTime,
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
// `resendWithPruning`). Reads are unaffected by it: `get`/`list`, and in
// particular `getAudience` below, already return full contact PII (email,
// phone, gender) for any `broadcasts`-scoped token — including a
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
      summary: "Get all broadcasts",
      tags: ["Broadcasts"],
    })
    .input(publicListRequest)
    .output(publicListBroadcastsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listBroadcasts({
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
      summary: "Get broadcast by id or name",
      tags: ["Broadcasts"],
    })
    .input(z.object({ idOrName: z.string() }))
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
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        idOrName: z.string(),
        page: z.coerce.number().int().min(1).optional(),
        perPage: z.coerce.number().int().min(1).optional(),
      }),
    )
    .output(listBroadcastAudienceResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await listBroadcastAudience({
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
      tags: ["Broadcasts"],
    })
    .input(publicListBroadcastContactsRequest)
    .output(publicListBroadcastContactsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const { id, eventType, page, perPage } = input
      const [existingId] = await broadcastService.listExistingIds({
        workspaceId: context.workspace.id,
        ids: [id],
      })
      if (!existingId) {
        throw notFoundException("Broadcast not found")
      }

      const { contactInboxIds, contactEventMap, total } =
        await broadcastAnalyticsService.getContacts({
          workspaceId: context.workspace.id,
          broadcastId: id,
          eventType,
          page,
          perPage,
        })
      const pageCount = Math.ceil(total / perPage)

      if (contactInboxIds.length === 0) {
        return { data: [], pageCount }
      }

      const contactInboxes = await contactInboxService.findManyByIds({
        workspaceId: context.workspace.id,
        ids: contactInboxIds,
      })
      const contactMap = new Map(contactInboxes.map((c) => [c.id, c]))

      const data = contactInboxIds
        .map((contactInboxId) =>
          mapBroadcastContactRow(
            contactInboxId,
            contactEventMap.get(contactInboxId),
            contactMap.get(contactInboxId),
          ),
        )
        .filter((row) => row !== null)

      return { data, pageCount }
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts",
      summary: "Create a broadcast",
      successStatus: 201,
      tags: ["Broadcasts"],
    })
    .input(createBroadcastRequest)
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnCreatingResource)
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
      method: "PATCH",
      path: "/v1/broadcasts/{id}",
      summary: "Rename a broadcast",
      tags: ["Broadcasts"],
    })
    .input(updateBroadcastSchema.and(z.object({ id: zodBigintAsString() })))
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
      summary: "Replace a draft broadcast's full payload",
      description:
        "Only matches a broadcast whose status is draft. Setting saveAsDraft to false schedules it.",
      tags: ["Broadcasts"],
    })
    .input(createBroadcastRequest.and(z.object({ id: zodBigintAsString() })))
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Schedule a draft broadcast",
      description: "Only matches a broadcast whose status is draft.",
      tags: ["Broadcasts"],
    })
    .input(scheduleBroadcastSchema.and(z.object({ id: zodBigintAsString() })))
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await broadcastService.scheduleDraft({
        workspaceId: context.workspace.id,
        broadcastId: id,
        schedulesType: data.schedulesType,
        schedulesAt: resolveScheduleTime(data),
      })
    }),

  moveToDraft: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/move-to-draft",
      summary: "Move a scheduled broadcast back to draft",
      description: "Only matches a broadcast whose status is scheduled.",
      tags: ["Broadcasts"],
    })
    .input(z.object({ id: zodBigintAsString() }))
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
      summary: "Stop a broadcast that is currently sending",
      description: "Only matches a broadcast whose status is sending.",
      tags: ["Broadcasts"],
    })
    .input(z.object({ id: zodBigintAsString() }))
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
      summary: "Resume a stopped broadcast",
      description: "Only matches a broadcast whose status is cancelled.",
      tags: ["Broadcasts"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.resumeSending({
          workspaceId: context.workspace.id,
          broadcastId: input.id,
        }),
    ),

  resend: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{id}/resend",
      summary: "Resend a sent or failed broadcast",
      description:
        "Clones a sent or failed broadcast into a new immediately-scheduled one. Only matches a broadcast whose status is sent or failed.",
      successStatus: 201,
      tags: ["Broadcasts"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.resendWithPruning({
          workspaceId: context.workspace.id,
          id: input.id,
          canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/broadcasts/{id}",
      summary: "Delete a broadcast",
      description:
        "Soft-deletes the broadcast. A broadcast that is currently sending cannot be deleted.",
      successStatus: 204,
      tags: ["Broadcasts"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await broadcastService.softDeleteBroadcasts({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
