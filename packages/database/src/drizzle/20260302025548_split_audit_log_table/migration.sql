CREATE TABLE "AuditLog" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"chatbotId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Log" RENAME TO "ErrorLog";--> statement-breakpoint
ALTER TABLE "ErrorLog" DROP CONSTRAINT "Log_userId_fkey";--> statement-breakpoint
ALTER TABLE "ErrorLog" RENAME CONSTRAINT "Log_chatbotId_fkey" TO "ErrorLog_chatbotId_fkey";--> statement-breakpoint
ALTER TABLE "ErrorLog" RENAME CONSTRAINT "Log_contactId_fkey" TO "ErrorLog_contactId_fkey";--> statement-breakpoint
ALTER TABLE "ErrorLog" ADD COLUMN "httpCode" text;--> statement-breakpoint
ALTER TABLE "ErrorLog" DROP COLUMN "logType";--> statement-breakpoint
ALTER TABLE "ErrorLog" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "ErrorLog" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
