import { HttpResponse, http } from "msw"

/**
 * MSW handlers for the Google Sheets API. Import in a test and register via
 * `server.use(...testHandlers)` to intercept outbound calls.
 */
export const testHandlers = [
  http.get("https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId", () =>
    HttpResponse.json({
      spreadsheetId: "test",
      properties: { title: "Test Sheet" },
      sheets: [],
    }),
  ),

  http.post(
    "https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values/:range:append",
    () => HttpResponse.json({ updates: { updatedRows: 1 } }),
  ),
]
