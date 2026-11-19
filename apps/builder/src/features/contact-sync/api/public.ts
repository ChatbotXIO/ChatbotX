import { contactSyncService } from "@chatbotx.io/business"
import {
  possibleErrorsOnConnectingContactSyncImport,
  possibleErrorsOnContactSyncRun,
  possibleErrorsOnContactSyncSource,
  possibleErrorsOnListingResource,
  possibleErrorsOnReadingContactSyncRun,
  possibleErrorsOnReadingContactSyncSource,
  possibleErrorsOnRetryingContactSyncHistory,
  possibleErrorsOnSchedulingContactSync,
} from "@/lib/orpc/orpc-error-helper"
import { assertTokenScope } from "@/lib/public-api/token-scope"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  cancelContactSyncPublicResponse,
  contactSyncAvailabilityResponse,
  contactSyncRunIdRequest,
  contactSyncRunResource,
  createContactSyncPublicRequest,
  createContactSyncPublicResponse,
  getContactSyncSchemaPublicRequest,
  getContactSyncSchemaPublicResponse,
  listContactSyncSourcesPublicRequest,
  listContactSyncSourcesPublicResponse,
  listContactSyncsPublicRequest,
  listContactSyncsPublicResponse,
  retryContactSyncHistoryRequest,
  retryContactSyncHistoryResponse,
  saveContactSyncMappingsPublicRequest,
  startContactImportRequest,
  startContactImportResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

/** The signed AhaChat requests of a token's calls name the token as the actor. */
const tokenActor = (apiToken: { id: string }) =>
  ({ type: "api_token", id: apiToken.id }) as const

const TAGS = ["Contacts"]

export const contactSyncPublicRouter = {
  listSources: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contact-syncs/sources",
      summary: "List contact sync sources",
      description:
        "Every connected page of the workspace (Messenger, Instagram, Zalo, Telegram) with whether AhaChat has it, found by itself: no AhaChat token is needed. Use the `inboxId` of an eligible one with `contactSyncs.create`.",
      tags: TAGS,
    })
    .input(listContactSyncSourcesPublicRequest)
    .output(listContactSyncSourcesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => ({
      data: await contactSyncService.listSources({
        workspaceId: context.workspace.id,
        actor: tokenActor(context.apiToken),
        provider: input.provider,
      }),
    })),

  getSchema: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contact-syncs/sources/{inboxId}/schema",
      summary: "Get tags and custom fields of sync source",
      description:
        "The source's tags and custom fields with the workspace tag/field each one maps to. Change mappings with `contactSyncs.saveMappings`.",
      tags: TAGS,
    })
    .input(getContactSyncSchemaPublicRequest)
    .output(getContactSyncSchemaPublicResponse)
    .errors(possibleErrorsOnReadingContactSyncSource)
    .handler(async ({ context, input }) => {
      const { tags, fields } = await contactSyncService.getSchema({
        workspaceId: context.workspace.id,
        actor: tokenActor(context.apiToken),
        inboxId: input.inboxId,
      })
      return { tags, fields }
    }),

  saveMappings: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contact-syncs/sources/{inboxId}/mappings",
      summary: "Map source tags and custom fields to workspace ones",
      description:
        "Sets which workspace tag / custom field each listed source tag / field lands on. Targets go by id or by exact name (a field name also needs its type). Every row is checked first: any invalid row rejects the call with 422 listing each one, and nothing is saved. Unlisted mappings are kept.",
      successStatus: 204,
      tags: TAGS,
    })
    .input(saveContactSyncMappingsPublicRequest)
    .errors(possibleErrorsOnContactSyncSource)
    .handler(async ({ context, input }) => {
      await contactSyncService.saveMappings({
        workspaceId: context.workspace.id,
        actor: tokenActor(context.apiToken),
        inboxId: input.inboxId,
        tags: input.tags,
        fields: input.fields,
      })
    }),

  getAvailability: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contact-syncs/availability",
      summary: "Check whether contact sync can start now",
      description:
        "One sync may run per workspace, and a new one may start 4 hours after the last Contacts-menu sync (the import at page connect does not count). Returns the blocking reason and `nextSyncAt`.",
      tags: TAGS,
    })
    .output(contactSyncAvailabilityResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) =>
        await contactSyncService.getAvailability({
          workspaceId: context.workspace.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contact-syncs",
      summary: "Start contact sync",
      description:
        "Imports contacts (with tags and custom fields) from the given sources in the background, one source after the other. Nothing it creates or changes runs a trigger, flow or webhook. Rejected with 409 while a sync runs or within 4 hours of the last one (`contactSyncs.getAvailability`). Follow progress with `contactSyncs.get`.",
      successStatus: 202,
      tags: TAGS,
    })
    .input(createContactSyncPublicRequest)
    .output(createContactSyncPublicResponse)
    .errors(possibleErrorsOnSchedulingContactSync)
    .handler(async ({ context, input }) => {
      const run = await contactSyncService.schedule({
        workspaceId: context.workspace.id,
        actor: tokenActor(context.apiToken),
        triggerSource: "api",
        sources: input.sources,
        syncTags: input.syncTags,
        syncCustomFields: input.syncCustomFields,
        overwriteExisting: input.overwriteExisting,
      })
      return { runId: run.id }
    }),

  startConnectImport: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contact-syncs/connect-import",
      summary: "Import connected pages from AhaChat first",
      description:
        "For Messenger / Instagram pages you just connected: imports their contacts, tags and custom fields from AhaChat first (fast), then starts the normal history sync (coexist) on each page by itself, whatever the import's outcome. A page AhaChat does not have, an unrelated sync running, more than 50 pages, or a page whose history already runs falls back: its normal history sync is started at once (`historyStarted`). Needs the `contacts` and `channels` scopes. Follow the run with `contactSyncs.get`.",
      successStatus: 202,
      tags: TAGS,
    })
    .input(startContactImportRequest)
    .output(startContactImportResponse)
    .errors(possibleErrorsOnConnectingContactSyncImport)
    .handler(async ({ context, input }) => {
      // An import writes contacts AND turns on a channel's history sync.
      assertTokenScope(context, "channels")
      return await contactSyncService.scheduleConnectImport({
        workspaceId: context.workspace.id,
        actor: tokenActor(context.apiToken),
        triggerSource: "api",
        pages: input.pages,
      })
    }),

  retryHistory: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contact-syncs/sources/{inboxId}/retry-history",
      summary: "Retry history sync after contact import",
      description:
        "When a page's contacts import ended but its normal history sync could not start (`followUpError` is `cancelled`, `channelUnavailable`, `workspaceUnavailable` or `expired` on the run item), re-opens it; it starts within a minute and turns on the channel's history sync, so the token needs the `contacts` and `channels` scopes. Only while the page is connected. Returns `reopened: false` (not an error) when nothing was waiting.",
      tags: TAGS,
    })
    .input(retryContactSyncHistoryRequest)
    .output(retryContactSyncHistoryResponse)
    .errors(possibleErrorsOnRetryingContactSyncHistory)
    .handler(async ({ context, input }) => {
      assertTokenScope(context, "channels")
      return await contactSyncService.retryHistory({
        workspaceId: context.workspace.id,
        inboxId: input.inboxId,
      })
    }),

  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contact-syncs",
      summary: "List contact sync runs",
      description:
        "Every contact sync run of the workspace, newest first, with the counts and status of each source.",
      tags: TAGS,
    })
    .input(listContactSyncsPublicRequest)
    .output(listContactSyncsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, pageCount } = await contactSyncService.listHistory({
        workspaceId: context.workspace.id,
        page: input.page,
        perPage: input.perPage,
      })
      return { data, pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contact-syncs/{runId}",
      summary: "Get contact sync run",
      description:
        "Status of the run and of each source: created, updated, skipped and failed counts, and the error a source ended with.",
      tags: TAGS,
    })
    .input(contactSyncRunIdRequest)
    .output(contactSyncRunResource)
    .errors(possibleErrorsOnReadingContactSyncRun)
    .handler(
      async ({ context, input }) =>
        await contactSyncService.get({
          workspaceId: context.workspace.id,
          runId: input.runId,
        }),
    ),

  cancel: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contact-syncs/{runId}/cancel",
      summary: "Cancel contact sync run",
      description:
        "Stops the run; contacts already imported are kept. Pages of a connect import still start their normal history sync once their item ended. Returns `cancelled: false` (not an error) when the run already finished, so it is safe to call repeatedly.",
      tags: TAGS,
    })
    .input(contactSyncRunIdRequest)
    .output(cancelContactSyncPublicResponse)
    .errors(possibleErrorsOnContactSyncRun)
    .handler(
      async ({ context, input }) =>
        await contactSyncService.cancel({
          workspaceId: context.workspace.id,
          runId: input.runId,
        }),
    ),
}
