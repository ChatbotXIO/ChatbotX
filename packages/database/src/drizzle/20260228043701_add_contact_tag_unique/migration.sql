ALTER TABLE "_ContactToTag" RENAME COLUMN "A" TO "contactId";--> statement-breakpoint
ALTER TABLE "_ContactToTag" RENAME COLUMN "B" TO "tagId";--> statement-breakpoint
DROP INDEX "_ContactToTag_B_index";--> statement-breakpoint
ALTER TABLE "_ContactToTag" DROP CONSTRAINT "_ContactToTag_AB_pkey";--> statement-breakpoint
ALTER TABLE "_ContactToTag" ADD CONSTRAINT "_ContactToTag_contactId_tagId_pkey" PRIMARY KEY("contactId","tagId");--> statement-breakpoint
CREATE UNIQUE INDEX "_ContactToTag_contactId_tagId_key" ON "_ContactToTag" ("contactId" text_ops,"tagId" text_ops);