import { getCalendarClient } from "../client"
import { handleError } from "../error"
import type { GoogleCalendarAuthValue } from "../schemas"

export async function verifyCalendarAccess(
  auth: GoogleCalendarAuthValue,
  calendarId: string,
): Promise<{ providerCalendarId: string; email?: string }> {
  try {
    const calendarClient = getCalendarClient(auth)
    const response = await calendarClient.calendarList.get({ calendarId })
    const providerCalendarId = response.data.id ?? calendarId
    const email = providerCalendarId.includes("@")
      ? providerCalendarId
      : (response.data.summary ?? undefined)

    return { providerCalendarId, email }
  } catch (error) {
    return handleError(error, "verifyCalendarAccess")
  }
}
