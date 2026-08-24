import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { devicePlatformTypes } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

export const devicePlatform = pgEnum(
  "devicePlatform",
  devicePlatformTypes.options as [string, ...string[]],
)

export const userDeviceTokenModel = pgTable(
  "UserDeviceToken",
  {
    ...sharedColumns,
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Nullable: a token can be registered before a workspace is selected, and
    // one device can receive push for whichever workspace it's currently in.
    workspaceId: bigintAsString().references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    platform: devicePlatform().notNull(),
    token: text().notNull(),
    lastSeenAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    // Upsert target — a push token moves between users across re-logins on
    // the same device, so it must stay globally unique, not per-user.
    unique("UserDeviceToken_token_key").on(table.token),
    index("UserDeviceToken_userId_idx").on(table.userId),
  ],
)
