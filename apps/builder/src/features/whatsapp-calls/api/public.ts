import {
  callRecordingService,
  whatsappCallHistoryService,
  whatsappCallSummaryService,
  whatsappCallTranscriptService,
} from "@chatbotx.io/business"
import { whatsappCallAiSummarySchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingWithCursor,
} from "@/lib/orpc/orpc-error-helper"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { InvalidWhatsappCallCursorError } from "../queries/list-whatsapp-calls.query"
import {
  CALL_ACTIVITY_CHIPS,
  whatsappCallListCursorSchema,
} from "../schema/query"
import { whatsappCallHistoryResource } from "../schema/resource"

// Call history, recordings and transcripts are customer PII and calling is
// paid, so these routes sit under the `integrations` scope (settings of a
// connected WhatsApp number): only `scopes: null` and explicit `integrations`
// tokens reach them. They read every call of the workspace — the token has no
// member to scope by — and never return the raw storage path of a recording.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

const callIdParam = z.object({
  id: zodBigintAsString().describe(
    "Call id. Get it from `whatsappCalls.list`.",
  ),
})

const publicCallResource = whatsappCallHistoryResource
  .omit({ recordingPath: true })
  .extend({
    hasRecording: z
      .boolean()
      .describe(
        "Whether a recording exists; fetch it with `whatsappCalls.getRecording`.",
      ),
  })

const listCallsRequest = z.object({
  activity: z
    .enum(CALL_ACTIVITY_CHIPS)
    .optional()
    .describe("`missed` or `noReply` calls only."),
  inboxId: zodBigintAsString()
    .optional()
    .describe("Only calls on this WhatsApp inbox. Get it from `inboxes.list`."),
  agentUserId: zodBigintAsString()
    .optional()
    .describe(
      "Only calls answered or placed by this agent. Get the user id from `workspaceMembers.list`.",
    ),
  cursor: z
    .string()
    .optional()
    .describe("`nextCursor` from the previous page; omit for the first page."),
})

export const whatsappCallsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/calls",
      summary: "List WhatsApp calls",
      description:
        "Lists the workspace's WhatsApp calls, newest first, 25 per page (cursor-paginated). Filter by `activity` (missed, noReply), `inboxId` or `agentUserId`. Contains customer names; recordings are not included, use `whatsappCalls.getRecording` for one.",
      tags: ["WhatsApp Calls"],
    })
    .input(listCallsRequest)
    .output(
      z.object({
        data: z.array(publicCallResource),
        nextCursor: z.string().nullable(),
      }),
    )
    .errors(possibleErrorsOnListingWithCursor)
    .handler(async ({ context, input }) => {
      const cursor = input.cursor
        ? decodeCursor(input.cursor, whatsappCallListCursorSchema)
        : null
      if (input.cursor && !cursor) {
        throw new InvalidWhatsappCallCursorError()
      }
      const result = await whatsappCallHistoryService.list({
        workspaceId: context.workspace.id,
        member: "workspace",
        activity: input.activity,
        inboxId: input.inboxId,
        agentUserId: input.agentUserId,
        cursor: cursor ?? undefined,
      })
      return {
        data: result.data.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          direction: row.direction,
          status: row.status,
          outcome: row.outcome,
          kind: row.kind,
          durationSeconds: row.durationSeconds,
          hasRecording: Boolean(row.recordingPath),
          conversationId: row.conversationId,
          contact: row.contact,
          inbox: row.inbox,
          answeredByUser: row.answeredByUser
            ? { id: row.answeredByUser.id, name: row.answeredByUser.name }
            : null,
          initiatedByUser: row.initiatedByUser
            ? { id: row.initiatedByUser.id, name: row.initiatedByUser.name }
            : null,
        })),
        nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
      }
    }),

  getRecording: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/calls/{id}/recording",
      summary: "Get WhatsApp call recording URL",
      description:
        "Returns a signed URL that plays the call recording for 15 minutes; call again for a fresh one. 404 when the call has no recording. The recording is customer audio: handle it accordingly.",
      tags: ["WhatsApp Calls"],
    })
    .input(callIdParam)
    .output(z.object({ url: z.string() }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      url: await callRecordingService.getRecordingUrlForCall({
        callId: input.id,
        workspaceId: context.workspace.id,
      }),
    })),

  getTranscript: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/calls/{id}/transcript",
      summary: "Get WhatsApp call transcript",
      description:
        "Returns the call transcript as timestamped segments with speaker names. `segments` is empty when the call was not transcribed.",
      tags: ["WhatsApp Calls"],
    })
    .input(callIdParam)
    .output(
      z.object({
        segments: z.array(
          z.object({
            speaker: z.string().nullish(),
            start: z.number().nullish(),
            end: z.number().nullish(),
            text: z.string(),
          }),
        ),
        speakerNames: z.record(z.string(), z.string()),
        hasSpeakers: z.boolean(),
      }),
    )
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const result = await whatsappCallTranscriptService.getTranscriptForCall({
        callId: input.id,
        workspaceId: context.workspace.id,
      })
      return {
        segments: result.segments,
        speakerNames: { ...result.speakerNames },
        hasSpeakers: result.hasSpeakers,
      }
    }),

  getSummary: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/calls/{id}/summary",
      summary: "Get WhatsApp call AI summary",
      description:
        "Returns the AI summary generated for the call and the provider that wrote it. `summary` is null until one was generated in the inbox.",
      tags: ["WhatsApp Calls"],
    })
    .input(callIdParam)
    .output(
      z.object({
        summary: whatsappCallAiSummarySchema.nullable(),
        provider: z.string().nullable(),
      }),
    )
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const result = await whatsappCallSummaryService.getSummaryForCall({
        callId: input.id,
        workspaceId: context.workspace.id,
      })
      return {
        summary: result?.aiSummary ?? null,
        provider: result?.aiSummaryProvider ?? null,
      }
    }),
}
