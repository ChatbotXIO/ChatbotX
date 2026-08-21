import {
  appointmentExternalCalendarService,
  buildContext,
} from "@chatbotx.io/business"
import type { GoogleCredential } from "@chatbotx.io/database/partials"
import type { IntegrationGoogleCalendarModel } from "@chatbotx.io/database/types"
import {
  type GoogleCalendarAuthValue,
  googleCalendarAuthSchema,
  integration as integrationGoogleCalendar,
} from "@chatbotx.io/integration-google-calendar"
import type { NextRequest } from "next/server"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "@/lib/log"

export async function exchangeAndVerifyGoogleCalendar(input: {
  credentialConfig: GoogleCredential
  req: NextRequest
  callbackUrl: string
  workspaceId: string
}) {
  try {
    const result = await integrationGoogleCalendar.handleRequest?.({
      config: {
        ...input.credentialConfig,
        redirectUrl: input.callbackUrl,
      },
      req: input.req,
    })
    const auth = googleCalendarAuthSchema.parse(result)
    const providerCalendarId = auth.metadata?.providerCalendarId ?? "primary"

    return {
      auth,
      providerCalendarId,
      email: auth.metadata?.email ?? null,
    }
  } catch (error) {
    logger.error(
      { err: normalizeError(error), workspaceId: input.workspaceId },
      "Failed to exchange Google Calendar OAuth callback",
    )
    throw error
  }
}

export async function verifyGoogleCalendarId(input: {
  workspaceId: string
  integrationId: string
  providerCalendarId: string
}) {
  try {
    const { ctx } = await buildGoogleCalendarContext(input)
    return await integrationGoogleCalendar.runAction("verifyCalendar", {
      ctx,
      props: { calendarId: input.providerCalendarId },
    })
  } catch (error) {
    logger.error(
      {
        err: normalizeError(error),
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
      },
      "Failed to verify Google Calendar ID",
    )
    throw error
  }
}

export async function disconnectGoogleCalendarProvider(input: {
  workspaceId: string
  connection: IntegrationGoogleCalendarModel
}) {
  try {
    const auth = googleCalendarAuthSchema.parse(input.connection.auth)
    await integrationGoogleCalendar.disconnect?.(auth)
  } catch (error) {
    logger.warn(
      {
        err: normalizeError(error),
        workspaceId: input.workspaceId,
        integrationId: input.connection.integrationId,
      },
      "Failed to revoke Google Calendar token",
    )
  }
}

async function buildGoogleCalendarContext(input: {
  workspaceId: string
  integrationId: string
}) {
  const connection =
    await appointmentExternalCalendarService.getGoogleConnectionForProviderCall(
      input,
    )
  const auth = googleCalendarAuthSchema.parse(connection.auth)
  const ctx = await buildContext<GoogleCalendarAuthValue>({
    workspaceId: input.workspaceId,
    integrationType: "googleCalendar",
    integration: {
      ...connection,
      auth,
    },
  })

  return { connection, ctx }
}
