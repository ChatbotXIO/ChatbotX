import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"

export type PermissionStatus = "ready" | "missingPermission" | "unverified"

export const permissionStatusConfig = {
  ready: {
    labelKey: "ads.connectAccounts.status.ready",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  missingPermission: {
    labelKey: "ads.connectAccounts.status.missingPermission",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  unverified: {
    labelKey: "ads.connectAccounts.status.unverified",
    className: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground/60",
  },
} as const satisfies Record<
  PermissionStatus,
  { labelKey: string; className: string; dotClassName: string }
>

const permissionStatusOrder = [
  "ready",
  "missingPermission",
  "unverified",
] as const satisfies readonly PermissionStatus[]

const permissionStatusResolvers = {
  ready: ({ integration }) => integration.hasCapiScope,
  missingPermission: ({ integration, whatsappCredentialPublic }) =>
    !integration.hasCapiScope && whatsappCredentialPublic !== null,
  unverified: ({ integration, whatsappCredentialPublic }) =>
    !integration.hasCapiScope && whatsappCredentialPublic === null,
} satisfies Record<
  PermissionStatus,
  (params: {
    integration: { hasCapiScope: boolean }
    whatsappCredentialPublic: WhatsappCredentialPublic | null
  }) => boolean
>

export function getPermissionStatus(
  integration: { hasCapiScope: boolean },
  whatsappCredentialPublic: WhatsappCredentialPublic | null,
): PermissionStatus {
  return (
    permissionStatusOrder.find((status) =>
      permissionStatusResolvers[status]({
        integration,
        whatsappCredentialPublic,
      }),
    ) ?? "unverified"
  )
}
