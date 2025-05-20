import { z } from "zod"

export const saveSpreadsheetSchema = z.object({
  name: z.string().min(1).max(255),
  url: z
    .string()
    .url()
    .refine(
      (url) => url.includes("docs.google.com/spreadsheets"),
      "URL must be a valid Google Sheets link",
    ),
})

export type SaveSpreadsheetSchema = z.infer<typeof saveSpreadsheetSchema>
