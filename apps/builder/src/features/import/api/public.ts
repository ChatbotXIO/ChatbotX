import { createImportUpload, importService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import {
  buildContactsImportTemplateCsv,
  CONTACTS_IMPORT_TEMPLATE_FILENAME,
} from "@/features/contacts/lib/contacts-import-template"
import {
  possibleErrorsOnCreatingImportUpload,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnPeekingImportHeaders,
} from "@/lib/orpc/orpc-error-helper"
import { withListPagingNote } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { peekImportHeadersForApi } from "../lib/peek-import-headers-for-api"
import {
  contactImportPublicResource,
  contactImportTemplatePublicResponse,
  getContactImportPublicRequest,
  importHeadersPublicRequest,
  importHeadersPublicResponse,
  importTemplatePublicRequest,
  importUploadUrlPublicRequest,
  importUploadUrlPublicResponse,
  listContactImportsPublicRequest,
  listContactImportsPublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const importPublicRouter = {
  createImportUpload: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/imports/upload-url",
      summary: "Create contact import upload URL",
      description:
        "Step 1 of a contact import: declares the CSV (`fileName`, `mimeType` text/csv, `fileSize` in bytes, max 20 MB) and returns a presigned `presignedPostUrl` plus a `fileId`. Upload the file bytes to `presignedPostUrl` with an HTTP PUT, then start the import with `contacts.import` using that `fileId`.",
      successStatus: 201,
      tags: ["Contacts"],
    })
    .input(importUploadUrlPublicRequest)
    .output(importUploadUrlPublicResponse)
    .errors(possibleErrorsOnCreatingImportUpload)
    .handler(
      async ({ context, input }) =>
        await createImportUpload({
          ...input,
          workspaceId: context.workspace.id,
          userId: null,
          type: "contacts",
        }),
    ),

  getImportTemplate: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/import-template",
      summary: "Get contact import template",
      description:
        "Returns the CSV template for `contacts.import` as text: a header row with the importable columns plus one example row. Save `content` as a .csv file, fill it in, then upload it with `contacts.createImportUpload`.",
      tags: ["Contacts"],
    })
    .input(importTemplatePublicRequest)
    .output(contactImportTemplatePublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      fileName: CONTACTS_IMPORT_TEMPLATE_FILENAME,
      mimeType: "text/csv",
      content: buildContactsImportTemplateCsv(
        input.language ?? context.workspace.language,
      ),
    })),

  peekImportHeaders: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/imports/files/{fileId}/headers",
      summary: "Read contact import file headers",
      description:
        "Returns the column headers of an uploaded contact import file so you can name the matching columns (`phoneNumber`, `contactId`, `email`, `firstName`, `lastName`, `sourceUserId`, `fieldMapping`) in `contacts.import`. Call `contacts.createImportUpload` and upload the file first.",
      tags: ["Contacts"],
    })
    .input(importHeadersPublicRequest)
    .output(importHeadersPublicResponse)
    .errors(possibleErrorsOnPeekingImportHeaders)
    .handler(async ({ context, input }) => ({
      headers: await peekImportHeadersForApi({
        workspaceId: context.workspace.id,
        fileId: input.fileId,
        type: "contacts",
      }),
    })),

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
      summary: "Get contact import job",
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
