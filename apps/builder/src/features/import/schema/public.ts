import { importStatuses } from "@chatbotx.io/database/partials"
import { flowCapabilitySchema } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"

const importErrorSampleSchema = z.object({
  capability: flowCapabilitySchema.optional(),
  code: z.string().optional(),
  path: z.string().optional(),
  reason: z.string(),
  row: z.number().optional(),
})

export const contactImportPublicResource = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  fileId: z.string(),
  fileName: z.string(),
  type: z.literal("contacts"),
  status: importStatuses,
  totalCount: z.number(),
  processedCount: z.number(),
  successCount: z.number(),
  failedCount: z.number(),
  errorMessage: z.string().nullable(),
  errorSample: z.array(importErrorSampleSchema),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const productImportPublicResource = contactImportPublicResource.extend({
  type: z.literal("products"),
})

export const listContactImportsPublicRequest = publicListRequest.extend({
  status: importStatuses
    .optional()
    .describe("Filter to import jobs in this status."),
  keyword: z
    .string()
    .nullish()
    .describe(
      "Case-insensitive substring match against the import's file name.",
    ),
  sort: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .optional()
    .describe(
      "Sort order as [{ id, desc }] pairs, e.g. `createdAt`, `status`, `completedAt`, `totalCount`, `successCount`, `failedCount`. Defaults to newest first.",
    ),
})

export const listContactImportsPublicResponse = publicListResponse(
  contactImportPublicResource,
)

export const listProductImportsPublicResponse = publicListResponse(
  productImportPublicResource,
)

export const getContactImportPublicRequest = z.object({
  id: z.string().describe("Import job id. Get it from `contacts.listImports`."),
})

export const getProductImportPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Import job id. Get it from `products.listImports`.",
  ),
})

export const importUploadUrlPublicRequest = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .describe("File name including its extension, e.g. `people.csv`."),
  mimeType: z
    .string()
    .min(1)
    .max(255)
    .describe(
      "MIME type of the file, e.g. `text/csv`. It must match the file extension.",
    ),
  fileSize: z
    .number()
    .int()
    .positive()
    .describe(
      "File size in bytes. Rejected when it exceeds the import's size limit.",
    ),
})

export const importUploadUrlPublicResponse = z.object({
  fileId: z
    .string()
    .describe("Id to pass to the import route once the file is uploaded."),
  presignedPostUrl: z
    .string()
    .describe(
      "URL to upload the file bytes to with an HTTP PUT and the same Content-Type as `mimeType`.",
    ),
  publicUrl: z.string().describe("Public location of the file after upload."),
  path: z.string().describe("Storage path of the file."),
})

export const importHeadersPublicRequest = z.object({
  fileId: zodBigintAsString().describe(
    "File id from the matching `createImportUpload` route, after the bytes were uploaded.",
  ),
})

export const importHeadersPublicResponse = z.object({
  headers: z
    .array(z.string())
    .describe("Column headers of the first row, in file order."),
})

const suggestedColumn = (field: string) =>
  z.string().optional().describe(`File column recognised as the ${field}.`)

export const contactImportHeadersPublicResponse =
  importHeadersPublicResponse.extend({
    suggestedColumnMap: z
      .object({
        phoneNumber: suggestedColumn("phone number"),
        contactId: suggestedColumn("channel user id"),
        email: suggestedColumn("email"),
        firstName: suggestedColumn("first name"),
        lastName: suggestedColumn("last name"),
        sourceUserId: suggestedColumn("WhatsApp user id (BSUID)"),
      })
      .describe(
        "Columns recognised by header name, the way the builder pre-fills its import dialog. Spread it into `contacts.import` and adjust what is wrong; unrecognised fields are absent.",
      ),
  })

export const productImportHeadersPublicResponse =
  importHeadersPublicResponse.extend({
    suggestedColumnMap: z
      .object({
        name: suggestedColumn("product name"),
        sku: suggestedColumn("SKU"),
        price: suggestedColumn("price"),
        discount: suggestedColumn("discount"),
        shortDescription: suggestedColumn("short description"),
        category: suggestedColumn("category name"),
        vendor: suggestedColumn("vendor"),
        inventoryQuantity: suggestedColumn("inventory quantity"),
        imageUrl: suggestedColumn("image URL"),
        productUrl: suggestedColumn("product page URL"),
      })
      .describe(
        "Columns recognised by header name, the way the builder pre-fills its import dialog. `products.startImport` uses it when `columnMap` is omitted.",
      ),
  })

export const importTemplateLanguages = z.enum(["en", "vi"])

export const importTemplatePublicRequest = z.object({
  language: importTemplateLanguages
    .optional()
    .describe(
      "Language of the column headers. Defaults to the workspace language (en or vi).",
    ),
})

export const contactImportTemplatePublicResponse = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  content: z
    .string()
    .describe("The CSV template as text: a header row and one example row."),
})

export const productImportTemplatePublicResponse = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  contentBase64: z
    .string()
    .describe("The XLSX template, base64-encoded: header row plus examples."),
})
