"use client"

import type { SocialProvider } from "@chatbotx.io/database/partials"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { orpc } from "@/lib/orpc/query"
import { PROVIDER_LABELS } from "../lib/connections"
import { ConnectButton } from "./connect-button"
import { ConnectLoadError } from "./connect-network-section"
import { SocialLoginRow } from "./social-login-row"

const TIKTOK: SocialProvider = "tiktok"

/**
 * TikTok publishes through its own login, not an inbox: a compact card with
 * the connected logins and Connect. Rendered only when TikTok can be connected
 * here or a login already exists.
 */
export const TikTokPublishingCard = ({
  canManage,
  connectable,
  readOnly,
  workspaceId,
}: {
  canManage: boolean
  connectable: boolean
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const accounts = useQuery(
    orpc.socialAccountsAPIs.privateListSocialAccountsAPI.queryOptions({
      input: { workspaceId },
    }),
  )
  if (accounts.isError) {
    return <ConnectLoadError onRetry={() => accounts.refetch()} />
  }
  if (!accounts.isSuccess) {
    return null
  }
  const logins = accounts.data.items.filter(
    (account) => account.provider === TIKTOK,
  )
  if (!connectable && logins.length === 0) {
    return null
  }
  const connectedCount = logins.filter(
    (account) => account.status === "connected",
  ).length

  return (
    <section
      aria-labelledby="connect-tiktok"
      className="space-y-3 rounded-2xl border bg-card px-5 py-4"
    >
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="me-auto font-semibold text-base" id="connect-tiktok">
          {t("posts.connect.tiktokTitle")}
        </h2>
        {canManage ? (
          <ConnectButton
            connectable={connectable}
            connectedCount={connectedCount}
            disabled={readOnly}
            label={t("posts.connect.connectNetwork", {
              network: PROVIDER_LABELS[TIKTOK],
            })}
            provider={TIKTOK}
            variant="outline"
            workspaceId={workspaceId}
          />
        ) : null}
      </header>
      {logins.length > 0 ? (
        <ul className="space-y-2">
          {logins.map((account) => (
            <SocialLoginRow
              account={account}
              canManage={canManage}
              connectable={connectable}
              key={account.id}
              readOnly={readOnly}
              workspaceId={workspaceId}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
