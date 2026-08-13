CREATE TYPE "appointmentExternalSyncStatus" AS ENUM('pending', 'synced', 'failed');--> statement-breakpoint
CREATE TYPE "appointmentLocationTypeSnapshot" AS ENUM('inPerson', 'phoneCall', 'onlineMeeting');--> statement-breakpoint
CREATE TYPE "appointmentStatus" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "appointmentLocationType" AS ENUM('inPerson', 'phoneCall', 'onlineMeeting');--> statement-breakpoint
CREATE TYPE "appointmentScheduleWindowType" AS ENUM('rollingDays', 'dateRange', 'specificDay', 'anyFutureDate');--> statement-breakpoint
CREATE TYPE "appointmentReminderTimingUnit" AS ENUM('minutes', 'hours', 'days');--> statement-breakpoint
CREATE TYPE "appointmentReminderDispatchStatus" AS ENUM('pending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "Appointment" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"calendarId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"conversationId" bigint,
	"startAt" timestamp(6) with time zone NOT NULL,
	"endAt" timestamp(6) with time zone NOT NULL,
	"inviteeTimezone" text NOT NULL,
	"status" "appointmentStatus" DEFAULT 'scheduled'::"appointmentStatus" NOT NULL,
	"locationType" "appointmentLocationTypeSnapshot" NOT NULL,
	"locationDetail" text,
	"externalEventId" text,
	"externalSyncStatus" "appointmentExternalSyncStatus",
	"cancelledAt" timestamp(6) with time zone,
	"deletedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "AppointmentCalendar" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT false NOT NULL,
	"timezone" text NOT NULL,
	"durationMinutes" integer DEFAULT 30 NOT NULL,
	"bufferAfterMinutes" integer,
	"locationType" "appointmentLocationType" NOT NULL,
	"locationDetail" text,
	"scheduleWindowType" "appointmentScheduleWindowType" DEFAULT 'rollingDays'::"appointmentScheduleWindowType" NOT NULL,
	"scheduleWindowConfig" jsonb DEFAULT '{}' NOT NULL,
	"maxAppointmentsPerUser" integer,
	"dailyLimitEnabled" boolean DEFAULT false NOT NULL,
	"maxPerDay" integer,
	"allowGroupMeeting" boolean DEFAULT false NOT NULL,
	"maxPerSlot" integer,
	"confirmationMessage" text,
	"confirmationFlowId" bigint,
	"cancellationFlowId" bigint,
	"externalConnectionId" bigint,
	"publicLinkSlug" text NOT NULL,
	"deletedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "AppointmentCalendarAvailability" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"calendarId" bigint NOT NULL,
	"weekday" integer NOT NULL,
	"startMinute" integer NOT NULL,
	"endMinute" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AppointmentCalendarReminder" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"calendarId" bigint NOT NULL,
	"flowId" bigint NOT NULL,
	"timingValue" integer NOT NULL,
	"timingUnit" "appointmentReminderTimingUnit" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AppointmentReminderDispatch" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"appointmentId" bigint NOT NULL,
	"reminderConfigId" bigint NOT NULL,
	"contactInboxId" bigint,
	"sendAt" timestamp(6) with time zone NOT NULL,
	"status" "appointmentReminderDispatchStatus" DEFAULT 'pending'::"appointmentReminderDispatchStatus" NOT NULL,
	"jobId" text NOT NULL,
	"sentAt" timestamp(6) with time zone,
	"cancelledAt" timestamp(6) with time zone,
	"failedReason" text
);
--> statement-breakpoint
CREATE TABLE "IntegrationGoogleCalendar" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"auth" jsonb NOT NULL,
	"providerCalendarId" text DEFAULT 'primary' NOT NULL,
	"email" text
);
--> statement-breakpoint
CREATE TABLE "IntegrationOutlookCalendar" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"auth" jsonb NOT NULL,
	"providerCalendarId" text DEFAULT 'primary' NOT NULL,
	"email" text
);
--> statement-breakpoint
ALTER TABLE "ContactOnSmartDelay" ADD COLUMN "appointmentId" bigint;--> statement-breakpoint
CREATE INDEX "Appointment_workspaceId_idx" ON "Appointment" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Appointment_workspaceId_startAt_idx" ON "Appointment" ("workspaceId","startAt");--> statement-breakpoint
CREATE INDEX "Appointment_calendarId_status_startAt_idx" ON "Appointment" ("calendarId","status","startAt");--> statement-breakpoint
CREATE INDEX "Appointment_contactId_calendarId_status_idx" ON "Appointment" ("contactId","calendarId","status");--> statement-breakpoint
CREATE INDEX "AppointmentCalendar_workspaceId_idx" ON "AppointmentCalendar" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "AppointmentCalendar_workspaceId_name_key" ON "AppointmentCalendar" ("workspaceId","name") WHERE ("deletedAt" is null);--> statement-breakpoint
CREATE UNIQUE INDEX "AppointmentCalendar_publicLinkSlug_key" ON "AppointmentCalendar" ("publicLinkSlug");--> statement-breakpoint
CREATE INDEX "AppointmentCalendarAvailability_calendarId_idx" ON "AppointmentCalendarAvailability" ("calendarId");--> statement-breakpoint
CREATE UNIQUE INDEX "AppointmentCalendarReminder_dedupe_key" ON "AppointmentCalendarReminder" ("calendarId","flowId","timingValue","timingUnit");--> statement-breakpoint
CREATE UNIQUE INDEX "AppointmentReminderDispatch_jobId_key" ON "AppointmentReminderDispatch" ("jobId");--> statement-breakpoint
CREATE INDEX "AppointmentReminderDispatch_status_sendAt_idx" ON "AppointmentReminderDispatch" ("status","sendAt");--> statement-breakpoint
CREATE INDEX "AppointmentReminderDispatch_appointmentId_idx" ON "AppointmentReminderDispatch" ("appointmentId");--> statement-breakpoint
CREATE INDEX "AppointmentReminderDispatch_contactInboxId_idx" ON "AppointmentReminderDispatch" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "ContactOnSmartDelay_appointmentId_idx" ON "ContactOnSmartDelay" ("appointmentId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGoogleCalendar_integrationId_key" ON "IntegrationGoogleCalendar" ("integrationId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationOutlookCalendar_integrationId_key" ON "IntegrationOutlookCalendar" ("integrationId");--> statement-breakpoint
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_calendarId_AppointmentCalendar_id_fkey" FOREIGN KEY ("calendarId") REFERENCES "AppointmentCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentCalendar" ADD CONSTRAINT "AppointmentCalendar_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentCalendar" ADD CONSTRAINT "AppointmentCalendar_confirmationFlowId_Flow_id_fkey" FOREIGN KEY ("confirmationFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentCalendar" ADD CONSTRAINT "AppointmentCalendar_cancellationFlowId_Flow_id_fkey" FOREIGN KEY ("cancellationFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentCalendar" ADD CONSTRAINT "AppointmentCalendar_externalConnectionId_Integration_id_fkey" FOREIGN KEY ("externalConnectionId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentCalendarAvailability" ADD CONSTRAINT "AppointmentCalendarAvailability_QfahoIQAX592_fkey" FOREIGN KEY ("calendarId") REFERENCES "AppointmentCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentCalendarReminder" ADD CONSTRAINT "AppointmentCalendarReminder_5O4INfYC3dY3_fkey" FOREIGN KEY ("calendarId") REFERENCES "AppointmentCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentCalendarReminder" ADD CONSTRAINT "AppointmentCalendarReminder_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentReminderDispatch" ADD CONSTRAINT "AppointmentReminderDispatch_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentReminderDispatch" ADD CONSTRAINT "AppointmentReminderDispatch_appointmentId_Appointment_id_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentReminderDispatch" ADD CONSTRAINT "AppointmentReminderDispatch_a526jJM55OD7_fkey" FOREIGN KEY ("reminderConfigId") REFERENCES "AppointmentCalendarReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AppointmentReminderDispatch" ADD CONSTRAINT "AppointmentReminderDispatch_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnSmartDelay" ADD CONSTRAINT "ContactOnSmartDelay_appointmentId_Appointment_id_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleCalendar" ADD CONSTRAINT "IntegrationGoogleCalendar_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleCalendar" ADD CONSTRAINT "IntegrationGoogleCalendar_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOutlookCalendar" ADD CONSTRAINT "IntegrationOutlookCalendar_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOutlookCalendar" ADD CONSTRAINT "IntegrationOutlookCalendar_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;