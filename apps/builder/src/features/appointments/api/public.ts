import {
  appointmentService,
  conversationService,
  createInboxBookingLink,
  resolveTenantSettings,
  sendInboxBookingLink,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnBookingAppointment,
  possibleErrorsOnCreatingBookingLink,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListResponse } from "@/lib/public-api/list"
import {
  assertConversationAccessForCaller,
  contactIdFor,
  resolveSenderForCaller,
} from "@/lib/public-api/member-scope"
import { assertTokenScope } from "@/lib/public-api/token-scope"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  appointmentIdPublicRequest,
  appointmentListItemPublicResource,
  appointmentPublicResource,
  bookAppointmentPublicRequest,
  createBookingLinkPublicRequest,
  createBookingLinkPublicResponse,
  listAppointmentsPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("appointments")

const tags = ["Appointments"]

export const appointmentsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointments",
      summary: "List appointments",
      description:
        "Use this for upcoming (`tab: next`) or past appointments, or to find one by calendar before opening it with `appointments.get`. Returns paginated workspace appointments for scheduling workflows.",
      tags,
    })
    .input(listAppointmentsPublicRequest)
    .output(publicListResponse(appointmentListItemPublicResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { appUrl } = await resolveTenantSettings({
        workspaceId: context.workspace.id,
      })
      const { data, pageCount } = await appointmentService.list({
        workspaceId: context.workspace.id,
        calendarId: input.calendarId,
        tab: input.tab,
        search: input.search,
        page: input.page,
        perPage: input.perPage,
        appUrl,
      })
      return { data, pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointments/{id}",
      summary: "Get appointment",
      description:
        "Returns one appointment's booking details. Use `appointments.list` to find its id first.",
      tags,
    })
    .input(appointmentIdPublicRequest)
    .output(appointmentPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await appointmentService.findByOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  book: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/appointments",
      summary: "Book appointment",
      description:
        "Books a slot on a calendar for a contact. Runs the same availability, capacity, and daily-limit checks as the booking webview, and schedules reminders if configured on the calendar. Pass `conversationId` (a conversation of this contact, else `invalidAppointmentConversation` 400) and `inboxId` to also send the calendar's confirmation flow to the contact on that inbox; without `inboxId` the booking is silent. The same contact cannot hold two scheduled appointments at the same start on a calendar (`appointmentAlreadyScheduled` 409). `inviteeTimezone` should be an IANA name; an unrecognised value falls back to the calendar's timezone.",
      successStatus: 201,
      tags,
    })
    .input(bookAppointmentPublicRequest)
    .output(appointmentPublicResource)
    .errors(possibleErrorsOnBookingAppointment)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      // Member callers only book for contacts and conversations they can see;
      // workspace tokens stay unscoped. `bookAppointment` still checks the
      // conversation belongs to the contact.
      // `contactId` is a bare id here, while contactIdFor takes a prefixed
      // identifier (`id:`/`email:`/`phone:`).
      const contactId = await contactIdFor(context, `id:${input.contactId}`)
      let contactInboxId: string | undefined
      if (input.conversationId) {
        const conversation = await assertConversationAccessForCaller(
          context,
          input.conversationId,
        )
        if (input.inboxId) {
          const contactInbox =
            await conversationService.resolveContactInboxForConversation({
              conversation,
              workspaceId,
              inboxId: input.inboxId,
            })
          contactInboxId = contactInbox.id
        }
      }

      return await appointmentService.bookAppointment({
        workspaceId,
        calendarId: input.calendarId,
        contactId,
        conversationId: input.conversationId,
        contactInboxId,
        startAt: input.startAt,
        inviteeTimezone: input.inviteeTimezone,
      })
    }),

  createBookingLink: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/appointment-booking-link",
      summary: "Create appointment booking link",
      description:
        "Returns a booking-picker URL for the conversation's contact on a calendar; with send=true also sends it on the conversation as an agent message with a booking button (same prompt and button as the flow's appointment step). The contact picks a slot and the booking runs the calendar's usual checks, confirmation flow and reminders. The link expires after 24 hours and anyone holding it can book for that contact (a group conversation shares it with every member). Use appointmentCalendars.list for calendarId. `send=true` additionally requires the `inbox` token scope.",
      successStatus: 201,
      tags,
    })
    .input(createBookingLinkPublicRequest)
    .output(createBookingLinkPublicResponse)
    .errors(possibleErrorsOnCreatingBookingLink)
    .handler(async ({ context, input }) => {
      // Before any lookup, so a token without `inbox` learns nothing about
      // the conversation.
      if (input.send) {
        assertTokenScope(context, "inbox")
      }
      const workspaceId = context.workspace.id
      const conversation = await assertConversationAccessForCaller(
        context,
        input.conversationId,
      )
      const contactInbox =
        await conversationService.resolveContactInboxForConversation({
          conversation,
          workspaceId,
          inboxId: input.inboxId,
        })
      const { appUrl } = await resolveTenantSettings({ workspaceId })
      const linkInput = {
        workspaceId,
        conversation,
        contactInbox,
        calendarId: input.calendarId,
        appUrl,
      }

      if (input.send) {
        const sent = await sendInboxBookingLink({
          ...linkInput,
          user: resolveSenderForCaller(context),
          bypassThreadControlLock: input.bypassThreadControlLock,
        })
        return {
          url: sent.url,
          expiresAt: sent.expiresAt,
          calendar: sent.calendar,
          messageId: sent.message?.id ?? null,
        }
      }

      const link = await createInboxBookingLink(linkInput)
      return {
        url: link.url,
        expiresAt: link.expiresAt,
        calendar: link.calendar,
        messageId: null,
      }
    }),

  cancel: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/appointments/{id}/cancel",
      summary: "Cancel appointment",
      description:
        "Cancels a booked appointment without deleting its record. Use `appointments.list` to find its id first.",
      tags,
    })
    .input(appointmentIdPublicRequest)
    .output(appointmentPublicResource)
    .errors(possibleErrorsOnBookingAppointment)
    .handler(
      async ({ context, input }) =>
        await appointmentService.cancelAppointmentById({
          workspaceId: context.workspace.id,
          appointmentId: input.id,
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/appointments/{id}",
      summary: "Delete appointment",
      description:
        "Soft-deletes an appointment. Upcoming scheduled appointments must be cancelled first.",
      successStatus: 204,
      tags,
    })
    .input(appointmentIdPublicRequest)
    .errors(possibleErrorsOnBookingAppointment)
    .handler(async ({ context, input }) => {
      await appointmentService.deleteAppointmentById({
        workspaceId: context.workspace.id,
        appointmentId: input.id,
      })
    }),
}
