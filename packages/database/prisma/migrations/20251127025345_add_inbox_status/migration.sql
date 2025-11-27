-- AlterTable
ALTER TABLE "Inbox" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'connected';

UPDATE "Inbox" SET "status" = 'disconnected' WHERE id IN (
  select "Inbox"."id"
  from "Inbox"
  left join "IntegrationMessenger" on "IntegrationMessenger"."pageId" = "Inbox"."sourceId"
  left join "IntegrationWhatsapp" on "IntegrationWhatsapp"."phoneNumberId" = "Inbox"."sourceId"
  left join "IntegrationZalo" on "IntegrationZalo"."oaId" = "Inbox"."sourceId"
  where "inboxType" in ('messenger', 'whatsapp', 'zalo')
  and "IntegrationMessenger"."id" is null
  and "IntegrationWhatsapp"."id" is null
  and "IntegrationZalo"."id" is null
)
