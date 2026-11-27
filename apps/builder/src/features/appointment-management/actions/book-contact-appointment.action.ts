"use server"

import {
  AppointmentAlreadyScheduledException,
  AppointmentAvailabilityChangedException,
  appointmentService,
  conversationService,
  SlotUnavailableException,
} from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { requireContactAccessForMember } from "@/features/contacts/permissions"
import { assertConversationAccessForCaller } from "@/lib/public-api/member-scope"
import { workspaceActionClient } from "@/lib/safe-action"
import { bookContactAppointmentRequest } from "../schema/action"

const bookedResult = {
  appointment: null,
  completed: false,
  staleSlot: false,
  availabilityChanged: false,
  alreadyScheduled: false,
}

/**
 * Books a slot for a contact from the inbox's contact panel. Same booking
 * path as the webview and public `appointments.book`. With `conversationId`,
 * the confirmation flow and reminders reach the contact on their most recently
 * active inbox — the one a plain text reply from the composer would use —
 * instead of an arbitrary `conversation.contactInboxes` entry. Without it the
 * booking is silent.
 */
export const bookContactAppointmentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bookContactAppointmentRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    await requireContactAccessForMember({
      permissions: ctx.workspaceMemberPermissions,
      userId: ctx.user.id,
      workspaceId,
      contactId: parsedInput.contactId,
    })

    let contactInboxId: string | undefined
    if (parsedInput.conversationId) {
      const conversation = await assertConversationAccessForCaller(
        {
          workspace: ctx.workspace,
          member: ctx.workspaceMember,
          user: ctx.user,
        },
        parsedInput.conversationId,
      )
      const contactInbox =
        await conversationService.resolveContactInboxForConversation({
          conversation,
          workspaceId,
        })
      contactInboxId = contactInbox.id
    }

    try {
      const appointment = await appointmentService.bookAppointment({
        workspaceId,
        calendarId: parsedInput.calendarId,
        contactId: parsedInput.contactId,
        conversationId: parsedInput.conversationId,
        contactInboxId,
        startAt: new Date(parsedInput.startAt),
        inviteeTimezone: parsedInput.inviteeTimezone,
      })
      return {
        ...bookedResult,
        appointment: { id: appointment.id },
        completed: true,
      }
    } catch (error) {
      if (error instanceof SlotUnavailableException) {
        return { ...bookedResult, staleSlot: true }
      }
      // Not a stale slot: the contact already holds this start, so a refetch
      // would offer the same slot again. The dialog shows its own message.
      if (error instanceof AppointmentAlreadyScheduledException) {
        return { ...bookedResult, alreadyScheduled: true }
      }
      if (error instanceof AppointmentAvailabilityChangedException) {
        return { ...bookedResult, availabilityChanged: true }
      }
      throw error
    }
  })
