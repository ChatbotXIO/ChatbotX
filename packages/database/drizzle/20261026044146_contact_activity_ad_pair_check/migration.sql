-- Allows the new (adClicked, ad) activity pair. The new enum values were added
-- by the previous migration and cannot be used in the same transaction, hence
-- this separate file. ContactActivity is large and hash-partitioned, so the
-- widened CHECK is added NOT VALID: enforced for new rows at once, with no
-- table scan. Dropping the old CHECK in the same transaction leaves no window
-- without one. It is never validated: every existing row passes the old CHECK,
-- which this one only widens, so a scan under a lock would prove nothing.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "ContactActivity" DROP CONSTRAINT "ContactActivity_allowed_pair_check";--> statement-breakpoint
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_allowed_pair_check" CHECK (("activityType" = 'flowExecuted' AND "referenceType" = 'flow' AND "parentReferenceId" = 0) OR ("activityType" = 'flowNodeExecuted' AND "referenceType" = 'flowNode' AND "parentReferenceId" <> 0) OR ("activityType" = 'automatedResponseMatched' AND "referenceType" = 'automatedResponse' AND "parentReferenceId" = 0) OR ("activityType" = 'formCompleted' AND "referenceType" = 'whatsappFlow' AND "parentReferenceId" = 0) OR ("activityType" = 'messageSent' AND "referenceType" = 'emailTopic' AND "parentReferenceId" = 0) OR ("activityType" = 'messageDelivered' AND "referenceType" = 'emailTopic' AND "parentReferenceId" = 0) OR ("activityType" = 'messageOpened' AND "referenceType" = 'emailTopic' AND "parentReferenceId" = 0) OR ("activityType" = 'messageClicked' AND "referenceType" = 'emailTopic' AND "parentReferenceId" = 0) OR ("activityType" = 'adClicked' AND "referenceType" = 'ad' AND "parentReferenceId" = 0)) NOT VALID;
