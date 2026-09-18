-- Rename the comment-automation tables: the `FB` prefix is factually wrong.
-- The table now serves five channels (messenger, instagram, instagramFacebook,
-- threads, tiktok) — three of which are not Facebook. Every object added after
-- the original table already dropped the prefix (commentAutomationReplyChannel,
-- commentAutomationMissReason, …); this finishes the job.
--
-- Postgres keeps the old index and constraint names across RENAME, so each one
-- is re-pointed explicitly to the name the schema snapshot expects. Skipping
-- that would leave the drift guard failing forever with no obvious cause.

ALTER TABLE "FBCommentAutomation" RENAME TO "CommentAutomation";
--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" RENAME TO "CommentAutomationEvent";
--> statement-breakpoint
ALTER TABLE "FBCommentAutomationMiss" RENAME TO "CommentAutomationMiss";
--> statement-breakpoint
ALTER TABLE "FBCommentAutomationReply" RENAME TO "CommentAutomationReply";
--> statement-breakpoint
ALTER TABLE "CommentAutomation" RENAME CONSTRAINT "FBCommentAutomation_pkey" TO "CommentAutomation_pkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationEvent" RENAME CONSTRAINT "FBCommentAutomationEvent_pkey" TO "CommentAutomationEvent_pkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationMiss" RENAME CONSTRAINT "FBCommentAutomationMiss_pkey" TO "CommentAutomationMiss_pkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationReply" RENAME CONSTRAINT "FBCommentAutomationReply_pkey" TO "CommentAutomationReply_pkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomation" RENAME CONSTRAINT "FBCommentAutomation_folderId_Folder_id_fkey" TO "CommentAutomation_folderId_Folder_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomation" RENAME CONSTRAINT "FBCommentAutomation_workspaceId_Workspace_id_fkey" TO "CommentAutomation_workspaceId_Workspace_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationEvent" RENAME CONSTRAINT "FBCommentAutomationEvent_LOfdyJGW0vJy_fkey" TO "CommentAutomationEvent_automationId_CommentAutomation_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationEvent" RENAME CONSTRAINT "FBCommentAutomationEvent_contactId_Contact_id_fkey" TO "CommentAutomationEvent_contactId_Contact_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationEvent" RENAME CONSTRAINT "FBCommentAutomationEvent_contactInboxId_ContactInbox_id_fkey" TO "CommentAutomationEvent_contactInboxId_ContactInbox_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationEvent" RENAME CONSTRAINT "FBCommentAutomationEvent_workspaceId_Workspace_id_fkey" TO "CommentAutomationEvent_workspaceId_Workspace_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationMiss" RENAME CONSTRAINT "FBCommentAutomationMiss_4mfgnR9RsQNo_fkey" TO "CommentAutomationMiss_automationId_CommentAutomation_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationMiss" RENAME CONSTRAINT "FBCommentAutomationMiss_contactId_Contact_id_fkey" TO "CommentAutomationMiss_contactId_Contact_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationMiss" RENAME CONSTRAINT "FBCommentAutomationMiss_contactInboxId_ContactInbox_id_fkey" TO "CommentAutomationMiss_contactInboxId_ContactInbox_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationMiss" RENAME CONSTRAINT "FBCommentAutomationMiss_workspaceId_Workspace_id_fkey" TO "CommentAutomationMiss_workspaceId_Workspace_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationReply" RENAME CONSTRAINT "FBCommentAutomationReply_Q6yXIfuQcsD0_fkey" TO "CommentAutomationReply_automationId_CommentAutomation_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationReply" RENAME CONSTRAINT "FBCommentAutomationReply_contactId_Contact_id_fkey" TO "CommentAutomationReply_contactId_Contact_id_fkey";
--> statement-breakpoint
ALTER TABLE "CommentAutomationReply" RENAME CONSTRAINT "FBCommentAutomationReply_workspaceId_Workspace_id_fkey" TO "CommentAutomationReply_workspaceId_Workspace_id_fkey";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_automation_occurredAt_idx" RENAME TO "CommentAutomationEvent_automation_occurredAt_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_contactId_idx" RENAME TO "CommentAutomationEvent_contactId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_contactInboxId_idx" RENAME TO "CommentAutomationEvent_contactInboxId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_dedup_idx" RENAME TO "CommentAutomationEvent_dedup_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_failed_createdAt_idx" RENAME TO "CommentAutomationEvent_failed_createdAt_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_private_unseen_idx" RENAME TO "CommentAutomationEvent_private_unseen_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationMiss_automation_occurredAt_idx" RENAME TO "CommentAutomationMiss_automation_occurredAt_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationMiss_contactId_idx" RENAME TO "CommentAutomationMiss_contactId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationMiss_contactInboxId_idx" RENAME TO "CommentAutomationMiss_contactInboxId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationMiss_dedup_idx" RENAME TO "CommentAutomationMiss_dedup_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationReply_contactId_idx" RENAME TO "CommentAutomationReply_contactId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationReply_dedup_idx" RENAME TO "CommentAutomationReply_dedup_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomation_folderId_idx" RENAME TO "CommentAutomation_folderId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomation_workspaceId_idx" RENAME TO "CommentAutomation_workspaceId_idx";
--> statement-breakpoint
ALTER TYPE "fbCommentAutomationType" RENAME TO "commentAutomationType";
