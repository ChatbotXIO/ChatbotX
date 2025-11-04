import { z } from "zod"

export const createSpreadsheetRequest = z.object({
  name: z.string().min(1).max(255),
  url: z
    .url()
    .refine(
      (url) => url.includes("docs.google.com/spreadsheets"),
      "URL must be a valid Google Spreadsheet link",
    ),
})

export type CreateSpreadsheetRequest = z.infer<typeof createSpreadsheetRequest>
