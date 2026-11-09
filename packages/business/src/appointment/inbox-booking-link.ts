import type {
  ContactInboxModel,
  ConversationModel,
  UserModel,
} from "@chatbotx.io/database/types"
import {
  APPOINTMENT_INBOX_LINK_TTL_MS,
  signAppointmentWebviewTokenWithExpiry,
} from "@chatbotx.io/encryption"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { normalizeError } from "universal-error-normalizer"
import { appointmentCalendarService } from "../appointment-calendar"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { messageService } from "../message/service"
import { getAppointmentSchedulingCopy } from "./copy"

// Kept out of appointment/service.ts on purpose: this module depends on the
// message service, and importing it there would create an
// appointment ↔ message import cycle.

type CreateInboxBookingLinkInput = {
  workspaceId: string
  conversation: Pick<ConversationModel, "id" | "contactId">
  contactInbox: Pick<ContactInboxModel, "id" | "inboxId" | "language">
  calendarId: string
  appUrl: string
}

export async function createInboxBookingLink(
  input: CreateInboxBookingLinkInput,
) {
  const calendar = await appointmentCalendarService.findByOrFail({
    workspaceId: input.workspaceId,
    id: input.calendarId,
  })
  if (!calendar.active) {
    throw new ChatbotXException(
      "Appointment calendar is inactive",
      "appointmentCalendarInactive",
      409,
    )
  }

  // No `channel`: nothing reads it for inbox tokens and it lengthens the URL.
  const { token, expiresAt } = await signAppointmentWebviewTokenWithExpiry(
    {
      source: "inbox",
      mode: "book",
      workspaceId: input.workspaceId,
      calendarId: calendar.id,
      contactId: input.conversation.contactId,
      conversationId: input.conversation.id,
      contactInboxId: input.contactInbox.id,
    },
    APPOINTMENT_INBOX_LINK_TTL_MS,
  )
  const pickerUrl = new URL("/booking/picker", input.appUrl)
  pickerUrl.searchParams.set("token", token)
  const url = pickerUrl.toString()
  const copy = getAppointmentSchedulingCopy(input.contactInbox)

  logger.info(
    {
      workspaceId: input.workspaceId,
      conversationId: input.conversation.id,
      calendarId: calendar.id,
      action: "createInboxBookingLink",
    },
    "Created inbox appointment booking link",
  )

  // The same message the appointmentScheduling flow step sends: a short
  // prompt with a URL button, so the long tokenised link never shows as text.
  const button: MessageButtonTemplate = {
    id: createId(),
    label: copy.bookingButton,
    buttonType: "url",
    url,
    messengerExtensions: true,
  }

  return {
    url,
    expiresAt,
    calendar: { id: calendar.id, name: calendar.name },
    content: { text: copy.bookingPrompt, button },
  }
}

export async function sendInboxBookingLink(
  input: CreateInboxBookingLinkInput & {
    conversation: ConversationModel
    contactInbox: ContactInboxModel
    user?: Pick<UserModel, "id">
    bypassThreadControlLock?: boolean
  },
) {
  const link = await createInboxBookingLink(input)

  try {
    const message = await messageService.createOutgoing({
      conversation: input.conversation,
      contactInbox: input.contactInbox,
      input: {
        text: link.content.text,
        inboxId: input.contactInbox.inboxId,
        bypassThreadControlLock: input.bypassThreadControlLock,
        // Persisted on the row (inbox bubble, Messenger button template) and
        // passed to the channel send, as a flow button message does.
        contentAttributes: {
          type: "template",
          payload: { templateType: "button", buttons: [link.content.button] },
        },
        quickReplies: [link.content.button],
      },
      user: input.user,
    })
    return { ...link, message }
  } catch (error) {
    logger.warn(
      {
        err: normalizeError(error),
        workspaceId: input.workspaceId,
        conversationId: input.conversation.id,
        calendarId: input.calendarId,
        action: "sendInboxBookingLink",
        reason: "createOutgoingFailed",
      },
      "Failed to send inbox appointment booking link",
    )
    throw error
  }
}
