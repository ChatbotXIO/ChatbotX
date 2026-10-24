export const platformAdminRoles = ["super-admin", "support"] as const

export type PlatformAdminRole = (typeof platformAdminRoles)[number]
