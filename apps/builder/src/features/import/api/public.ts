import { importService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { withListPagingNote } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  contactImportPublicResource,
  getContactImportPublicRequest,
  listContactImportsPublicRequest,
  listContactImportsPublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const importPublicRouter = {
  listImports: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/imports",
      summary: "List contact import jobs",
      description: withListPagingNote(
        "Returns background contact-import jobs started with `contacts.import`, most recent first. Use `contacts.getImport` for one job's full detail.",
      ),
      tags: ["Contacts"],
    })
    .input(listContactImportsPublicRequest)
    .output(listContactImportsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, pageCount } = await importService.list({
        ...input,
        workspaceId: context.workspace.id,
        type: "contacts",
      })
      return {
        data: data.map((row) => ({ ...row, type: "contacts" as const })),
        pageCount,
      }
    }),

  getImport: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/imports/{id}",
      summary: "Get a contact import job",
      description:
        "Returns one import job's progress and result counts. Call `contacts.listImports` to find its id first.",
      tags: ["Contacts"],
    })
    .input(getContactImportPublicRequest)
    .output(contactImportPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const imported = await importService.find({
        workspaceId: context.workspace.id,
        id: input.id,
        type: "contacts",
      })
      if (!imported) {
        throw notFoundException("Import not found")
      }
      return { ...imported, type: "contacts" as const }
    }),
}
