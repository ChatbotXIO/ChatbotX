import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import { z } from "zod"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationFacebookAdsModel } from "./integration-facebook-ads"
import { integrationWhatsappModel } from "./integration-whatsapp"
import { workspaceModel } from "./workspace"

export const adsConversionChannelValues = ["whatsapp", "facebook"] as const
export const adsConversionEventTypeValues = ["lead", "purchase"] as const

export const adsConversionChannelSchema = z.enum(adsConversionChannelValues)
export type AdsConversionChannel = z.infer<typeof adsConversionChannelSchema>

export const adsConversionEventTypeSchema = z.enum(adsConversionEventTypeValues)
export type AdsConversionEventType = z.infer<
  typeof adsConversionEventTypeSchema
>

export type AdsConversionRuleTrigger =
  | { type: "templateSent"; templateIds: string[] }
  | { type: "tagApplied"; tagIds: string[] }
  | { type: "keywordMatched"; automatedResponseIds: string[] }
  | { type: "contactReplied"; firstReplyOnly: boolean }

export const adsConversionChannel = pgEnum(
  "adsConversionChannel",
  adsConversionChannelValues,
)

export const adsConversionEventType = pgEnum(
  "adsConversionEventType",
  adsConversionEventTypeValues,
)

export const adsConversionRuleModel = pgTable(
  "AdsConversionRule",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: adsConversionChannel().notNull(),
    integrationWhatsappId: bigintAsString().references(
      () => integrationWhatsappModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    integrationFacebookAdsId: bigintAsString().references(
      () => integrationFacebookAdsModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    adAccountId: text(),
    eventType: adsConversionEventType().notNull(),
    trigger: jsonb().$type<AdsConversionRuleTrigger>().notNull(),
    markAs: text(),
    enabled: boolean().notNull().default(true),
  },
  (table) => [
    index("AdsConversionRule_workspaceId_channel_enabled_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.channel.asc().nullsLast(),
      table.enabled.asc().nullsLast(),
    ),
  ],
)
