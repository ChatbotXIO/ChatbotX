"use client"

import type { RoutingRolesSnapshot } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useNow } from "@/hooks/use-now"
import { orpc } from "@/lib/orpc/query"

type Translate = ReturnType<typeof useTranslations>

type RoutingRolesSectionProps = {
  workspaceId: string
  integrationWhatsappId: string
}

/**
 * Meta's routing role values (`GET /{phone_number_id}/routing_roles`) mapped to
 * their labels. A role Meta adds later still renders, under a generic label.
 * Brand-neutral copy (white-label).
 */
const ROUTING_ROLE_LABEL_KEYS = {
  calls: "conversationRouting.roles.calls",
  ctwa: "conversationRouting.roles.ctwa",
  customer_service: "conversationRouting.roles.customer_service",
  escalation: "conversationRouting.roles.escalation",
  marketing: "conversationRouting.roles.marketing",
  utility: "conversationRouting.roles.utility",
} as const

const isKnownRoutingRole = (
  role: string,
): role is keyof typeof ROUTING_ROLE_LABEL_KEYS =>
  Object.hasOwn(ROUTING_ROLE_LABEL_KEYS, role)

const routingRoleLabel = (t: Translate, role: string): string =>
  isKnownRoutingRole(role)
    ? t(ROUTING_ROLE_LABEL_KEYS[role])
    : t("conversationRouting.roles.other")

/** Copy shown instead of role badges, keyed by why there are none. */
const NO_ROLES_MESSAGE_KEYS = {
  neverChecked: "conversationRouting.settings.rolesNeverChecked",
  notEnabled: "conversationRouting.settings.rolesNotEnabled",
  none: "conversationRouting.settings.rolesNone",
} as const

const resolveNoRolesMessageKey = (
  snapshot: RoutingRolesSnapshot | null | undefined,
):
  | (typeof NO_ROLES_MESSAGE_KEYS)[keyof typeof NO_ROLES_MESSAGE_KEYS]
  | null => {
  if (!snapshot) {
    return NO_ROLES_MESSAGE_KEYS.neverChecked
  }
  if (!snapshot.enabled) {
    return NO_ROLES_MESSAGE_KEYS.notEnabled
  }
  return snapshot.roles.length === 0 ? NO_ROLES_MESSAGE_KEYS.none : null
}

/**
 * This app's Conversation Routing roles on the number, as Meta last reported
 * them. Roles are assigned by the business in Meta Business Suite; this only
 * reads them, on demand ("Check again"), so a Meta outage never costs a call
 * or an error toast per page view.
 */
export function RoutingRolesSection({
  workspaceId,
  integrationWhatsappId,
}: RoutingRolesSectionProps) {
  const t = useTranslations()
  const format = useFormatter()
  // Shared minute ticker: "Checked 5 minutes ago" keeps up, and next-intl gets
  // an explicit `now` (no ENVIRONMENT_FALLBACK).
  const nowMs = useNow()
  const queryClient = useQueryClient()
  const input = { workspaceId, integrationWhatsappId }
  const rolesQuery = orpc.integrationWhatsappAPIs.getWhatsappRoutingRolesAPI
  const { data: snapshot } = useQuery(rolesQuery.queryOptions({ input }))

  const sync = useMutation(
    orpc.integrationWhatsappAPIs.syncWhatsappRoutingRolesAPI.mutationOptions({
      onSuccess: async (data) => {
        const queryKey = rolesQuery.queryKey({ input })
        // An initial read still in flight must not land over the fresh answer.
        await queryClient.cancelQueries({ queryKey })
        queryClient.setQueryData(queryKey, data)
        // The locked composer reads the same snapshot keyed by inbox.
        await queryClient.invalidateQueries({
          queryKey:
            orpc.integrationWhatsappAPIs.getWhatsappRoutingRolesByInboxAPI.key(),
        })
      },
      onError: () => {
        toast.error(t("conversationRouting.settings.rolesSyncFailed"))
      },
    }),
  )

  const noRolesMessageKey = resolveNoRolesMessageKey(snapshot)

  return (
    <section
      aria-labelledby="routing-roles-title"
      className="flex flex-col gap-2 rounded-md border px-3 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-sm" id="routing-roles-title">
            {t("conversationRouting.settings.rolesTitle")}
          </span>
          <span className="text-muted-foreground text-xs">
            {t("conversationRouting.settings.rolesDescription")}
          </span>
        </div>
        <Button
          disabled={sync.isPending}
          onClick={() => sync.mutate(input)}
          size="sm"
          type="button"
          variant="outline"
        >
          {sync.isPending ? (
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon aria-hidden className="size-4" />
          )}
          {t("conversationRouting.settings.rolesRefresh")}
        </Button>
      </div>
      {noRolesMessageKey ? (
        <span className="text-muted-foreground text-sm">
          {t(noRolesMessageKey)}
        </span>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {snapshot?.roles.map((role) => (
            <li key={role}>
              <Badge variant="secondary">{routingRoleLabel(t, role)}</Badge>
            </li>
          ))}
        </ul>
      )}
      {snapshot?.enabled && (
        <span className="text-muted-foreground text-xs">
          {snapshot.isStandby
            ? t("conversationRouting.settings.rolesStandbyOn")
            : t("conversationRouting.settings.rolesStandbyOff")}
        </span>
      )}
      {snapshot && (
        <span className="text-muted-foreground text-xs">
          {t("conversationRouting.settings.rolesCheckedAt", {
            // The ticker moves once a minute: a check made since its last tick
            // is newer than `now`, which must read "now", never "in 15 seconds".
            time: format.relativeTime(
              new Date(snapshot.checkedAt),
              new Date(Math.max(nowMs, Date.parse(snapshot.checkedAt))),
            ),
          })}
        </span>
      )}
    </section>
  )
}
