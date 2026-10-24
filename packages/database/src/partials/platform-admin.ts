export const platformAdminRoles = [
  "super-admin",
  "support",
  "read-only",
] as const

export type PlatformAdminRole = (typeof platformAdminRoles)[number]

export const builderAdminRoles: readonly PlatformAdminRole[] = [
  "super-admin",
  "support",
]

export const isBuilderAdminRole = (
  role: string | null | undefined,
): role is PlatformAdminRole =>
  builderAdminRoles.includes(role as PlatformAdminRole)
