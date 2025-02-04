/*
  Warnings:

  - You are about to drop the column `channelId` on the `Inbox` table. All the data in the column will be lost.
  - You are about to drop the column `channelType` on the `Inbox` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Inbox" DROP COLUMN "channelId",
DROP COLUMN "channelType";

-- CreateTable
CREATE TABLE "_ContactToLog" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContactToLog_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ContactToLog_B_index" ON "_ContactToLog"("B");

-- AddForeignKey
ALTER TABLE "_ContactToLog" ADD CONSTRAINT "_ContactToLog_A_fkey" FOREIGN KEY ("A") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToLog" ADD CONSTRAINT "_ContactToLog_B_fkey" FOREIGN KEY ("B") REFERENCES "Log"("id") ON DELETE CASCADE ON UPDATE CASCADE;
