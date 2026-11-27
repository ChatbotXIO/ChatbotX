import { fileStatuses } from "@chatbotx.io/database/partials"
import { z } from "zod"

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n

/**
 * The decoded `cursor`, exactly as the repository writes it: `createdAt` in UTC
 * with microseconds (a `Date` would drop them), `id` a Postgres bigint. Strict,
 * so a tampered cursor fails to decode (`invalidCursor`) instead of failing a
 * cast in the query.
 */
export const contactExportFileCursor = z.object({
  createdAt: z.iso
    .datetime({ precision: 6 })
    // Postgres has no year 0, which the ISO format allows.
    .refine((value) => !value.startsWith("0000")),
  id: z
    .string()
    .regex(/^\d{1,19}$/)
    .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX),
})

export const contactExportFileResource = z.object({
  id: z
    .string()
    .describe(
      "Export file id. Pass it to `contacts.getExportFile` for a fresh download link.",
    ),
  status: fileStatuses.describe(
    "`uploaded` once the file is ready to download.",
  ),
  fileName: z.string(),
  totalRecords: z
    .number()
    .nullable()
    .describe("Contacts written to the file so far."),
  createdAt: z.date(),
  expiresAt: z
    .date()
    .describe(
      "When the export is past its retention. A daily sweep then deletes the file and this entry, so they may linger up to a day longer.",
    ),
  requestedBy: z
    .object({ id: z.string(), name: z.string().nullable() })
    .nullable()
    .describe(
      "Member who started the export; null when an API token did or the member's account was deleted.",
    ),
})
export type ContactExportFileResource = z.infer<
  typeof contactExportFileResource
>

export const listContactExportFilesRequest = z.object({
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Number of exports per page."),
  cursor: z
    .string()
    .optional()
    .describe(
      "Opaque pagination cursor from a previous response. Omit for the first page.",
    ),
})

export const listContactExportFilesResponse = z.object({
  data: z.array(contactExportFileResource),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as `cursor` for the next page; null on the last page."),
})
export type ListContactExportFilesResponse = z.infer<
  typeof listContactExportFilesResponse
>
