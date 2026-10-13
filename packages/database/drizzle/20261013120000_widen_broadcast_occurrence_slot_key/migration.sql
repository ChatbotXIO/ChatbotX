DROP INDEX "BroadcastRecurrenceOccurrence_recurrenceId_localSlot_key";--> statement-breakpoint
CREATE UNIQUE INDEX "BroadcastRecurrenceOccurrence_recurrenceId_localSlot_occurrenceAt_key" ON "BroadcastRecurrenceOccurrence" ("recurrenceId","localSlot","occurrenceAt");
