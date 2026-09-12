import { z } from "zod"

// `z.url()` constrains neither the scheme nor the host, and a substring test
// is unanchored — so the shape is checked against the parsed URL instead.
const isGoogleSpreadsheetUrl = (url: string): boolean => {
  if (!URL.canParse(url)) {
    return false
  }
  const parsed = new URL(url)
  return (
    parsed.protocol === "https:" &&
    parsed.host === "docs.google.com" &&
    parsed.pathname.startsWith("/spreadsheets/")
  )
}

export const createSpreadsheetRequest = z.object({
  name: z.string().min(1).max(255),
  url: z
    .url()
    .refine(
      isGoogleSpreadsheetUrl,
      "URL must be a valid Google Spreadsheet link",
    ),
})

export type CreateSpreadsheetRequest = z.infer<typeof createSpreadsheetRequest>
