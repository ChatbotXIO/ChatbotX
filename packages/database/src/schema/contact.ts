import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { genderTypes } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { workspaceModel } from "./workspace"

export const gender = pgEnum(
  "gender",
  genderTypes.options as [string, ...string[]],
)

export const contactModel = pgTable("Contact", {
  ...sharedColumns,
  avatar: text(),
  phoneNumber: text(),
  email: text(),
  emailVerified: boolean().default(false).notNull(),
  emailOptIn: boolean().default(false).notNull(),
  firstName: text(),
  lastName: text(),
  gender: gender(),
  lastReadAt: timestamp(timestampConfig),
  ref: text(),
  country: text(),
  state: text(),
  city: text(),
  location: jsonb().$type<{
    latitude: number
    longitude: number
  }>(),
  locale: text(),
  timezone: text(),
  subscribedAt: timestamp(timestampConfig),
  blockedAt: timestamp(timestampConfig),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  lastActivityAt: timestamp(timestampConfig).defaultNow().notNull(),
})
