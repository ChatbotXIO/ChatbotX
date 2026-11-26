import { contactSyncService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  contactSyncNotAdminError,
  possibleErrorsOnConnectingContactSyncImport,
  possibleErrorsOnContactSyncAdmin,
  possibleErrorsOnReadingContactSyncSource,
  possibleErrorsOnRetryingContactSyncHistory,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { requireContactSyncAdmin } from "../lib/access"
import {
  contactSyncAvailabilityResponse,
  contactSyncRunResource,
  getContactSyncSchemaPublicResponse,
  listContactSyncSourcesPublicResponse,
  retryContactSyncHistoryRequest,
  retryContactSyncHistoryResponse,
  startContactImportRequest,
  startContactImportResponse,
} from "../schema/public"

const workspaceRequest = z.object({ workspaceId: zodBigintAsString() })

/**
 * Session procedures behind the sync dialog and the page picker. Same service
 * methods as the public API; the caller must be a workspace admin, and the
 * signed AhaChat requests name them as the actor.
 */
export const contactSyncAuthenticatedAPI = {
  listSources: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contact-syncs/sources",
      summary: "List contact sync sources",
      tags: ["Contacts"],
    })
    .input(workspaceRequest)
    .output(listContactSyncSourcesPublicResponse)
    .errors(possibleErrorsOnContactSyncAdmin)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { userId } = await requireContactSyncAdmin(input.workspaceId)
      return {
        data: await contactSyncService.listSources({
          workspaceId: input.workspaceId,
          actor: { type: "user", id: userId },
        }),
      }
    }),

  getSchema: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contact-syncs/sources/{inboxId}/schema",
      summary: "Get tags and custom fields of sync source",
      tags: ["Contacts"],
    })
    .input(workspaceRequest.extend({ inboxId: zodBigintAsString() }))
    .output(getContactSyncSchemaPublicResponse)
    .errors({
      ...possibleErrorsOnReadingContactSyncSource,
      ...contactSyncNotAdminError,
    })
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { userId } = await requireContactSyncAdmin(input.workspaceId)
      const { tags, fields } = await contactSyncService.getSchema({
        workspaceId: input.workspaceId,
        actor: { type: "user", id: userId },
        inboxId: input.inboxId,
      })
      return { tags, fields }
    }),

  getAvailability: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contact-syncs/availability",
      summary: "Check whether contact sync can start now",
      tags: ["Contacts"],
    })
    .input(workspaceRequest)
    .output(contactSyncAvailabilityResponse)
    .errors(possibleErrorsOnContactSyncAdmin)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      await requireContactSyncAdmin(input.workspaceId)
      return await contactSyncService.getAvailability(input)
    }),

  getRun: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contact-syncs/{runId}",
      summary: "Get contact sync run",
      tags: ["Contacts"],
    })
    .input(workspaceRequest.extend({ runId: zodBigintAsString() }))
    .output(contactSyncRunResource)
    .errors(possibleErrorsOnContactSyncAdmin)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      await requireContactSyncAdmin(input.workspaceId)
      return await contactSyncService.get(input)
    }),

  /** The picker's call, right after the pages connected with "Sync history" on. */
  startContactImport: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contact-syncs/connect-import",
      summary: "Import connected pages from AhaChat first",
      tags: ["Contacts"],
    })
    .input(workspaceRequest.extend(startContactImportRequest.shape))
    .output(startContactImportResponse)
    .errors({
      ...possibleErrorsOnConnectingContactSyncImport,
      ...contactSyncNotAdminError,
    })
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { userId } = await requireContactSyncAdmin(input.workspaceId)
      return await contactSyncService.scheduleConnectImport({
        workspaceId: input.workspaceId,
        actor: { type: "user", id: userId },
        triggerSource: "app",
        pages: input.pages,
      })
    }),

  retryHistory: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contact-syncs/sources/{inboxId}/retry-history",
      summary: "Retry history sync after contact import",
      tags: ["Contacts"],
    })
    .input(workspaceRequest.extend(retryContactSyncHistoryRequest.shape))
    .output(retryContactSyncHistoryResponse)
    .errors({
      ...possibleErrorsOnRetryingContactSyncHistory,
      ...contactSyncNotAdminError,
    })
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      await requireContactSyncAdmin(input.workspaceId)
      return await contactSyncService.retryHistory({
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
      })
    }),
}
