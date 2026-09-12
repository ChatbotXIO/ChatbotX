ALTER TABLE "WhatsappCall" ADD COLUMN "livekitRoomName" text;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN "recordingPath" text;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN "recordedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN "transcribedAt" timestamp(6) with time zone;