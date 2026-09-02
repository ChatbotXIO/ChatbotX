import {
  and,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  isNull,
} from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import {
  appointmentCalendarModel,
  integrationGoogleCalendarModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationGoogleCalendarModel } from "@chatbotx.io/database/types"
import {
  type GoogleCalendarAuthValue,
  googleCalendarAuthSchema,
  integration as integrationGoogleCalendar,
} from "@chatbotx.io/integration-google-calendar"
import type { Oauth2AuthValue } from "@chatbotx.io/sdk"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { buildContext } from "../integration-context"

export type ExternalCalendarProviderType = "googleCalendar"

export type ExternalCalendarSelectItem = {
  id: string
  providerType: ExternalCalendarProviderType
  label: string
  providerCalendarId: string
  email: string | null
}

export type ExternalCalendarListItem = ExternalCalendarSelectItem & {
  workspaceId: string
  connectedCount: number
  createdAt: Date
  updatedAt: Date
}

class AppointmentExternalCalendarService extends BaseService {
  async list(input: { workspaceId: string }, tx: DatabaseClient = db) {
    return await tx.query.integrationModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        integrationType: {
          in: [
            integrationTypes.enum.googleCalendar,
            integrationTypes.enum.outlookCalendar,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    })
  }

  async createGoogleFromOAuthCallback(input: {
    workspaceId: string
    auth: Oauth2AuthValue
    providerCalendarId: string
    email?: string | null
  }) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          integrationId: integrationModel.id,
          googleCalendarId: integrationGoogleCalendarModel.id,
        })
        .from(integrationGoogleCalendarModel)
        .innerJoin(
          integrationModel,
          eq(integrationGoogleCalendarModel.integrationId, integrationModel.id),
        )
        .where(
          and(
            eq(integrationGoogleCalendarModel.workspaceId, input.workspaceId),
            eq(
              integrationGoogleCalendarModel.providerCalendarId,
              input.providerCalendarId,
            ),
            eq(
              integrationModel.integrationType,
              integrationTypes.enum.googleCalendar,
            ),
          ),
        )
        .limit(1)

      if (existing) {
        await tx
          .update(integrationGoogleCalendarModel)
          .set({
            auth: input.auth,
            providerCalendarId: input.providerCalendarId,
            email: input.email ?? null,
          })
          .where(
            eq(integrationGoogleCalendarModel.id, existing.googleCalendarId),
          )

        return existing.integrationId
      }

      const [integration] = await tx
        .insert(integrationModel)
        .values({
          workspaceId: input.workspaceId,
          integrationType: integrationTypes.enum.googleCalendar,
        })
        .returning({ id: integrationModel.id })

      if (!integration) {
        throw new ChatbotXException(
          "Failed to create Google Calendar connection",
        )
      }

      await tx.insert(integrationGoogleCalendarModel).values({
        workspaceId: input.workspaceId,
        integrationId: integration.id,
        auth: input.auth,
        providerCalendarId: input.providerCalendarId,
        email: input.email ?? null,
      })

      return integration.id
    })
  }

  async listForSelect(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ExternalCalendarSelectItem[]> {
    const rows = await tx
      .select({
        id: integrationModel.id,
        providerCalendarId: integrationGoogleCalendarModel.providerCalendarId,
        email: integrationGoogleCalendarModel.email,
      })
      .from(integrationModel)
      .innerJoin(
        integrationGoogleCalendarModel,
        eq(integrationGoogleCalendarModel.integrationId, integrationModel.id),
      )
      .where(
        and(
          eq(integrationModel.workspaceId, input.workspaceId),
          eq(
            integrationModel.integrationType,
            integrationTypes.enum.googleCalendar,
          ),
        ),
      )
      .orderBy(desc(integrationModel.createdAt))

    return rows.map((row) => ({
      id: row.id,
      providerType: "googleCalendar",
      label: this.formatGoogleCalendarLabel(row),
      providerCalendarId: row.providerCalendarId,
      email: row.email,
    }))
  }

  async listWithConnectedCount(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ExternalCalendarListItem[]> {
    const rows = await tx
      .select({
        id: integrationModel.id,
        workspaceId: integrationModel.workspaceId,
        providerCalendarId: integrationGoogleCalendarModel.providerCalendarId,
        email: integrationGoogleCalendarModel.email,
        createdAt: integrationModel.createdAt,
        updatedAt: integrationModel.updatedAt,
        connectedCount: count(appointmentCalendarModel.id),
      })
      .from(integrationModel)
      .innerJoin(
        integrationGoogleCalendarModel,
        eq(integrationGoogleCalendarModel.integrationId, integrationModel.id),
      )
      .leftJoin(
        appointmentCalendarModel,
        and(
          eq(
            appointmentCalendarModel.externalConnectionId,
            integrationModel.id,
          ),
          isNull(appointmentCalendarModel.deletedAt),
        ),
      )
      .where(
        and(
          eq(integrationModel.workspaceId, input.workspaceId),
          eq(
            integrationModel.integrationType,
            integrationTypes.enum.googleCalendar,
          ),
        ),
      )
      .groupBy(integrationModel.id, integrationGoogleCalendarModel.id)
      .orderBy(desc(integrationModel.createdAt))

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      providerType: "googleCalendar",
      label: this.formatGoogleCalendarLabel(row),
      providerCalendarId: row.providerCalendarId,
      email: row.email,
      connectedCount: row.connectedCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  }

  async updateGoogleCalendarId(
    input: {
      workspaceId: string
      integrationId: string
      providerCalendarId: string
      email?: string | null
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(integrationGoogleCalendarModel)
      .set({
        providerCalendarId: input.providerCalendarId,
        email: input.email ?? null,
      })
      .from(integrationModel)
      .where(
        and(
          eq(integrationGoogleCalendarModel.integrationId, integrationModel.id),
          eq(integrationGoogleCalendarModel.workspaceId, input.workspaceId),
          eq(integrationGoogleCalendarModel.integrationId, input.integrationId),
          eq(
            integrationModel.integrationType,
            integrationTypes.enum.googleCalendar,
          ),
        ),
      )
      .returning({ id: integrationGoogleCalendarModel.id })

    if (!row) {
      throw notFoundException("Google Calendar connection not found")
    }
  }

  async getGoogleConnectionForProviderCall(
    input: { workspaceId: string; integrationId: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationGoogleCalendarModel> {
    const [row] = await tx
      .select({ googleCalendar: integrationGoogleCalendarModel })
      .from(integrationGoogleCalendarModel)
      .innerJoin(
        integrationModel,
        eq(integrationGoogleCalendarModel.integrationId, integrationModel.id),
      )
      .where(
        and(
          eq(integrationGoogleCalendarModel.workspaceId, input.workspaceId),
          eq(integrationGoogleCalendarModel.integrationId, input.integrationId),
          eq(
            integrationModel.integrationType,
            integrationTypes.enum.googleCalendar,
          ),
        ),
      )
      .limit(1)

    if (!row) {
      throw notFoundException("Google Calendar connection not found")
    }

    return row.googleCalendar
  }

  async getBusyIntervalsForAppointmentCalendar(input: {
    workspaceId: string
    integrationId: string
    timeMin: string
    timeMax: string
    timeZone?: string
    timeoutMs?: number
  }): Promise<{ start: number; end: number }[]> {
    const connection = await this.getGoogleConnectionForProviderCall(input)
    const auth = googleCalendarAuthSchema.parse(connection.auth)
    const ctx = await buildContext<GoogleCalendarAuthValue>({
      workspaceId: input.workspaceId,
      integrationType: "googleCalendar",
      integration: {
        ...connection,
        auth,
      },
    })
    const busyEvents = await integrationGoogleCalendar.runAction(
      "getBusyEvents",
      {
        ctx,
        props: {
          calendarId: connection.providerCalendarId,
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          timeZone: input.timeZone,
          timeoutMs: input.timeoutMs,
        },
      },
    )

    return busyEvents.flatMap((event) => {
      const start = Date.parse(event.startAt)
      const end = Date.parse(event.endAt)
      if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
        return []
      }
      return [{ start, end }]
    })
  }

  async getDisconnectableGoogleConnection(input: {
    workspaceId: string
    integrationId: string
  }) {
    const [connection] = await this.listWithConnectedCount({
      workspaceId: input.workspaceId,
    }).then((items) => items.filter((item) => item.id === input.integrationId))

    if (!connection) {
      throw notFoundException("Google Calendar connection not found")
    }

    if (connection.connectedCount > 0) {
      throw new ChatbotXException(
        "Connection is in use",
        "connectionInUse",
        409,
      )
    }

    return await this.getGoogleConnectionForProviderCall(input)
  }

  async findGoogleCalendarByIntegrationId(
    input: { workspaceId: string; integrationId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.integrationGoogleCalendarModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
      },
    })
  }

  async findOutlookCalendarByIntegrationId(
    input: { workspaceId: string; integrationId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.integrationOutlookCalendarModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
      },
    })
  }

  async deleteByIntegrationIds(
    input: { workspaceId: string; integrationIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.integrationIds.length === 0) {
      return []
    }

    return await tx
      .delete(integrationModel)
      .where(
        and(
          eq(integrationModel.workspaceId, input.workspaceId),
          inArray(integrationModel.id, input.integrationIds),
          inArray(integrationModel.integrationType, [
            integrationTypes.enum.googleCalendar,
            integrationTypes.enum.outlookCalendar,
          ]),
        ),
      )
      .returning({ id: integrationModel.id })
  }

  async disconnect(input: { workspaceId: string; integrationId: string }) {
    await this.getDisconnectableGoogleConnection(input)

    const deleted = await this.deleteByIntegrationIds({
      workspaceId: input.workspaceId,
      integrationIds: [input.integrationId],
    })

    return deleted[0]?.id
  }

  private formatGoogleCalendarLabel(input: {
    providerCalendarId: string
    email: string | null
  }) {
    return input.email
      ? `${input.email} (${input.providerCalendarId})`
      : input.providerCalendarId
  }
}

export const appointmentExternalCalendarService =
  new AppointmentExternalCalendarService()
