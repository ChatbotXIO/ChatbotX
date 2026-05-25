import { boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../../partials/shared"
import { userModel } from "../auth-user"

export const platformSettingModel = pgTable("PlatformSetting", {
  ...sharedColumns,
  userId: bigintAsString()
    .notNull()
    .unique()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  brandName: text(),
  logoLightPath: text(),
  logoDarkPath: text(),
  faviconPath: text(),
  customCss: text(),
  customJs: text(),
  theme: text(),
  isEnabled: boolean().notNull().default(true),
  disabledReason: text(),
  policyUrl: text(),
  termsOfServiceUrl: text(),
  signupEmailTemplate: jsonb().$type<{ subject?: string; body?: string }>(),
  forgotPasswordEmailTemplate: jsonb().$type<{
    subject?: string
    body?: string
  }>(),
  magicLinkEmailTemplate: jsonb().$type<{ subject?: string; body?: string }>(),
})
