CREATE TABLE "WhatsappSignupSession" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"userId" bigint NOT NULL,
	"ownerId" bigint NOT NULL,
	"workspaceId" bigint,
	"wabaId" text NOT NULL,
	"businessId" text NOT NULL,
	"encryptedAccessToken" jsonb NOT NULL,
	"apiVersion" text NOT NULL,
	"candidatePhoneNumberIds" text[] NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"consumedAt" timestamp(6) with time zone,
	CONSTRAINT "WhatsappSignupSession_candidates_not_empty" CHECK (cardinality("candidatePhoneNumberIds") > 0)
);
--> statement-breakpoint
CREATE INDEX "WhatsappSignupSession_userId_idx" ON "WhatsappSignupSession" ("userId");--> statement-breakpoint
CREATE INDEX "WhatsappSignupSession_expiresAt_idx" ON "WhatsappSignupSession" ("expiresAt");--> statement-breakpoint
ALTER TABLE "WhatsappSignupSession" ADD CONSTRAINT "WhatsappSignupSession_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappSignupSession" ADD CONSTRAINT "WhatsappSignupSession_ownerId_User_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappSignupSession" ADD CONSTRAINT "WhatsappSignupSession_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;