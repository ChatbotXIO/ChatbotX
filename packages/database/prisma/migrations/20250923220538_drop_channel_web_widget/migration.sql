-- DropForeignKey
ALTER TABLE "public"."ChannelWebWidget" DROP CONSTRAINT "ChannelWebWidget_chatbotId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChannelWebWidget" DROP CONSTRAINT "ChannelWebWidget_webWidgetTemplateId_fkey";

-- DropTable
DROP TABLE "public"."ChannelWebWidget";

-- DropTable
DROP TABLE "public"."WebWidgetTemplate";