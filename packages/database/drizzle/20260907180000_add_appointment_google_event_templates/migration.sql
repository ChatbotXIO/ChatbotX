ALTER TABLE "Appointment" ADD COLUMN "contactInboxId" bigint;--> statement-breakpoint
ALTER TABLE "Appointment" ADD COLUMN "externalEventIntegrationId" bigint;--> statement-breakpoint
ALTER TABLE "Appointment" ADD COLUMN "externalEventProviderCalendarId" text;--> statement-breakpoint
ALTER TABLE "AppointmentCalendar" ADD COLUMN "externalEventTitleTemplate" text;--> statement-breakpoint
ALTER TABLE "AppointmentCalendar" ADD COLUMN "externalEventDescriptionTemplate" text;--> statement-breakpoint
ALTER TABLE "AppointmentCalendar" ADD COLUMN "externalEventAttendeesTemplate" text;--> statement-breakpoint
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
UPDATE "AppointmentCalendar"
SET
	"externalEventTitleTemplate" = 'Appointment: {{booking_calendar}}',
	"externalEventAttendeesTemplate" = '{{email}}'
WHERE "externalConnectionId" IS NOT NULL;
