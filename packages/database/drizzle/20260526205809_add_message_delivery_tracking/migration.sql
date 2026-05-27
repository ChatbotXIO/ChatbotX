-- Delivery tracking fields on Message (WhatsApp/Messenger/etc webhook status callbacks)
-- ✓ enviado (createdAt), ✓✓ deliveredAt, ✓✓ azul readAt, ⚠️ failedAt
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "readAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "failedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "failureReason" text;
