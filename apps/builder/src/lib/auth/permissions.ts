import { createAccessControl } from "better-auth/plugins/access"

/**
 * make sure to use `as const` so typescript can infer the type correctly
 */
const statement = {
  superAdmin: ["manage"],
  analytics: ["manage"],
  contacts: ["manage", "onlyAssigned", "readEmailAndPhone"],
  broadcasts: ["manage"],
  ecommerce: ["manage"],
  flows: ["manage"],
  notificationTypes: ["admin", "human", "newOrder"],
  notificationChannels: ["messenger", "email", "telegram", "browser"],
} as const

export const ac = createAccessControl(statement)
