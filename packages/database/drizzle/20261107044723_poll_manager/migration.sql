CREATE TABLE "PollCandidate" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"pollId" bigint NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"imageUrl" text
);
--> statement-breakpoint
CREATE TABLE "Poll" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"imageUrl" text NOT NULL,
	"startsAt" timestamp(6) with time zone NOT NULL,
	"endsAt" timestamp(6) with time zone NOT NULL,
	"afterVoteFlowId" bigint
);
--> statement-breakpoint
CREATE TABLE "PollVote" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"pollId" bigint NOT NULL,
	"candidateId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint
);
--> statement-breakpoint
CREATE INDEX "PollCandidate_pollId_position_idx" ON "PollCandidate" ("pollId","position");--> statement-breakpoint
CREATE INDEX "PollCandidate_workspaceId_idx" ON "PollCandidate" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Poll_workspaceId_createdAt_idx" ON "Poll" ("workspaceId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "Poll_afterVoteFlowId_idx" ON "Poll" ("afterVoteFlowId");--> statement-breakpoint
CREATE UNIQUE INDEX "PollVote_pollId_contactId_key" ON "PollVote" ("pollId","contactId");--> statement-breakpoint
CREATE INDEX "PollVote_workspaceId_idx" ON "PollVote" ("workspaceId");--> statement-breakpoint
CREATE INDEX "PollVote_candidateId_idx" ON "PollVote" ("candidateId");--> statement-breakpoint
CREATE INDEX "PollVote_contactId_idx" ON "PollVote" ("contactId");--> statement-breakpoint
CREATE INDEX "PollVote_contactInboxId_idx" ON "PollVote" ("contactInboxId");--> statement-breakpoint
ALTER TABLE "PollCandidate" ADD CONSTRAINT "PollCandidate_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PollCandidate" ADD CONSTRAINT "PollCandidate_pollId_Poll_id_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_afterVoteFlowId_Flow_id_fkey" FOREIGN KEY ("afterVoteFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_Poll_id_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_candidateId_PollCandidate_id_fkey" FOREIGN KEY ("candidateId") REFERENCES "PollCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;