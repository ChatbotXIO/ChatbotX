SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "Contact_firstName_trgm_idx" ON "Contact" USING gin ("firstName" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "Contact_lastName_trgm_idx" ON "Contact" USING gin ("lastName" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "Contact_email_trgm_idx" ON "Contact" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "Contact_phoneNumber_trgm_idx" ON "Contact" USING gin ("phoneNumber" gin_trgm_ops);
