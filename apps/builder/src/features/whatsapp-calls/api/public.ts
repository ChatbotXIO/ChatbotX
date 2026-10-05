import { aiProviders } from "@chatbotx.io/ai"
import { listConnectedCallSummaryProviders } from "@chatbotx.io/ai/server"
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
  possibleErrorsOnGeneratingCallSummary,
  possibleErrorsOnListingResource,
  possibleErrorsOnListingWithCursor,
} from "@/lib/orpc/orpc-error-helper"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { generateCallSummaryForCall } from "../lib/generate-call-summary"
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
        "Returns the AI summary generated for the call and the provider that wrote it. `summary` is null until one is generated, in the inbox or with `whatsappCalls.generateSummary`.",
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

  listSummaryProviders: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/calls/summary-providers",
      summary: "List call summary AI providers",
      description:
        "Lists the AI providers connected to this workspace that can write a call summary. Pass one `provider` value to `whatsappCalls.generateSummary` (needed only when more than one is listed). The list is empty when no AI integration is connected; connect one in the builder first.",
      tags: ["WhatsApp Calls"],
    })
    .output(
      z.object({
        providers: z.array(
          z.object({
            id: z
              .string()
              .describe(
                "Id of the connected AI integration in this workspace.",
              ),
            provider: aiProviders.describe(
              "Provider key to send as `provider` to `whatsappCalls.generateSummary`.",
            ),
            label: z.string().describe("Display name of the provider."),
          }),
        ),
      }),
    )
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => ({
      providers: await listConnectedCallSummaryProviders(context.workspace.id),
    })),

  generateSummary: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/whatsapp/calls/{id}/summary/generate",
      summary: "Generate WhatsApp call AI summary",
      description:
        "Writes an AI summary (`summary`, `keyPoints`, `actionItems`) from the call transcript with the chosen `provider` (omit it when only one is connected) and saves it, replacing any earlier summary. It calls the provider with the workspace's own AI connection, so it uses that account's AI quota. Find providers with `whatsappCalls.listSummaryProviders` and read the saved result with `whatsappCalls.getSummary`. Returns 422 when the call has no transcript, no AI provider is connected, the named provider is not connected, or `provider` is omitted while several are connected, and 409 while another summary is being generated for the same call.",
      successStatus: 200,
      tags: ["WhatsApp Calls"],
    })
    .input(
      callIdParam.extend({
        provider: aiProviders
          .optional()
          .describe(
            "AI provider that writes the summary. Omit it when exactly one AI provider is connected to the workspace; with several, pass one from `whatsappCalls.listSummaryProviders`.",
          ),
      }),
    )
    .output(
      z.object({
        summary: whatsappCallAiSummarySchema.describe(
          "The summary that was generated and saved.",
        ),
      }),
    )
    .errors(possibleErrorsOnGeneratingCallSummary)
    .handler(async ({ context, input }) => ({
      summary: await generateCallSummaryForCall({
        workspaceId: context.workspace.id,
        callId: input.id,
        provider: input.provider,
      }),
    })),
}
