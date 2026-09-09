import { contactVariableService } from "@chatbotx.io/variables"
import { z } from "zod"
import { logger } from "../lib/logger"

export const GOOGLE_EVENT_TITLE_MAX_LENGTH = 1024
export const GOOGLE_EVENT_DESCRIPTION_MAX_LENGTH = 8192
export const GOOGLE_EVENT_ATTENDEES_MAX_LENGTH = 8192

const emailSchema = z.string().email()
const attendeeSeparatorRegex = /[\n,;]/

export type AppointmentEventTemplateInput = {
  appointmentId: string
  contactId: string
  contactInboxId: string
  conversation: Parameters<
    typeof contactVariableService.getAll
  >[0]["conversation"]
  contact: { email: string | null }
  calendar: {
    name: string
    externalEventTitleTemplate: string | null
    externalEventDescriptionTemplate: string | null
    externalEventAttendeesTemplate: string | null
  }
}

export async function renderAppointmentExternalCalendarEventTemplate(
  input: AppointmentEventTemplateInput,
): Promise<{
  summary: string
  description?: string
  attendees?: { email: string }[]
}> {
  const variables = await contactVariableService.getAll({
    contactId: input.contactId,
    contactInbox: input.contactInboxId,
    conversation: input.conversation,
    appointmentId: input.appointmentId,
  })
  const render = async (template: string | null) =>
    template == null
      ? ""
      : await contactVariableService.replaceAll({ text: template, variables })

  const [renderedTitle, renderedDescription, renderedAttendees] =
    await Promise.all([
      render(input.calendar.externalEventTitleTemplate),
      render(input.calendar.externalEventDescriptionTemplate),
      render(input.calendar.externalEventAttendeesTemplate),
    ])

  ensureMaxLength(renderedTitle, GOOGLE_EVENT_TITLE_MAX_LENGTH, "title")
  ensureMaxLength(
    renderedDescription,
    GOOGLE_EVENT_DESCRIPTION_MAX_LENGTH,
    "description",
  )
  ensureMaxLength(
    renderedAttendees,
    GOOGLE_EVENT_ATTENDEES_MAX_LENGTH,
    "attendees",
  )

  const attendees =
    input.calendar.externalEventAttendeesTemplate === null
      ? defaultAttendees(input.contact.email)
      : parseAttendees(renderedAttendees)

  return {
    summary: renderedTitle.trim() || `Appointment: ${input.calendar.name}`,
    description: renderedDescription.trim() || undefined,
    attendees,
  }
}

function defaultAttendees(
  email: string | null,
): { email: string }[] | undefined {
  return email ? [{ email }] : undefined
}

function ensureMaxLength(value: string, max: number, field: string) {
  if (value.length > max) {
    throw new Error(`appointment_external_event_${field}_too_long`)
  }
}

function parseAttendees(value: string): { email: string }[] | undefined {
  const valid = new Map<string, { email: string }>()
  let invalidCount = 0
  for (const candidate of value.split(attendeeSeparatorRegex)) {
    const email = candidate.trim()
    if (!email) {
      continue
    }
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      invalidCount += 1
      continue
    }
    valid.set(parsed.data.toLowerCase(), { email: parsed.data })
  }
  if (invalidCount > 0) {
    logger.warn(
      { invalidCount, reason: "invalidAppointmentExternalEventAttendees" },
      "Skipped invalid appointment external-calendar attendee addresses",
    )
  }
  const attendees = [...valid.values()]
  return attendees.length > 0 ? attendees : undefined
}
