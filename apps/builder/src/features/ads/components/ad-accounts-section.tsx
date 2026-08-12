"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ReactNode } from "react"
import { toast } from "sonner"
import useSWR from "swr"
import { connectFacebookAdsFromAdsAction } from "@/features/integration-facebook-ads/actions/connect-from-ads.action"
import { client } from "@/lib/orpc/orpc"

type FacebookAdsStatus = {
  connected: boolean
  needsReconnect: boolean
}

type AdAccountsState = "notConnected" | "needsReconnect" | "connected"
type AdAccountsListState = "loading" | "error" | "empty" | "ready"

type AdAccountsResponse = Awaited<
  ReturnType<typeof client.integrationFacebookAdsAPI.listAdAccounts>
>

function ConnectFacebookAdsButton({
  isPending,
  label,
  onConnect,
  variant = "secondary",
}: {
  isPending: boolean
  label: string
  onConnect: () => void
  variant?: "outline" | "secondary"
}) {
  return (
    <Button
      disabled={isPending}
      onClick={onConnect}
      size="sm"
      variant={variant}
    >
      {isPending && <Loader2Icon className="animate-spin" />}
      {label}
    </Button>
  )
}

function ConnectedAdAccounts({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const adAccounts = useSWR<AdAccountsResponse>(
    ["facebook-ads-ad-accounts", workspaceId] as const,
    () => client.integrationFacebookAdsAPI.listAdAccounts({ workspaceId }),
  )
  const listStateOrder = [
    "loading",
    "error",
    "empty",
    "ready",
  ] as const satisfies readonly AdAccountsListState[]
  const listStateMatches = {
    loading: adAccounts.isLoading,
    error: Boolean(adAccounts.error),
    empty: (adAccounts.data?.data ?? []).length === 0,
    ready: true,
  } satisfies Record<AdAccountsListState, boolean>
  const listState =
    listStateOrder.find((status) => listStateMatches[status]) ?? "ready"

  const content = (
    {
      loading: (
        <div className="py-6 text-muted-foreground text-sm">
          {t("facebookAds.adAccounts.loading")}
        </div>
      ),
      error: (
        <div className="py-6 text-destructive text-sm">
          {t("facebookAds.adAccounts.error")}
        </div>
      ),
      empty: (
        <div className="py-6 text-muted-foreground text-sm">
          {t("ads.connectAccounts.adAccountsEmpty")}
        </div>
      ),
      ready: (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ads.connectAccounts.adAccountName")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(adAccounts.data?.data ?? []).map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <div className="font-medium">
                    {account.name ?? account.id}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {account.id}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ),
    } satisfies Record<AdAccountsListState, ReactNode>
  )[listState]

  return content
}

export function AdAccountsSection({
  facebookAds,
  workspaceId,
}: {
  facebookAds: FacebookAdsStatus
  workspaceId: string
}) {
  const t = useTranslations()
  const { execute, isPending } = useAction(
    connectFacebookAdsFromAdsAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const onConnect = () => execute()
  const stateOrder = [
    "notConnected",
    "needsReconnect",
    "connected",
  ] as const satisfies readonly AdAccountsState[]
  const stateMatches = {
    notConnected: !facebookAds.connected,
    needsReconnect: facebookAds.connected && facebookAds.needsReconnect,
    connected: facebookAds.connected && !facebookAds.needsReconnect,
  } satisfies Record<AdAccountsState, boolean>
  const state = stateOrder.find((status) => stateMatches[status]) ?? "connected"

  const stateContent = {
    notConnected: (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t("ads.connectAccounts.adAccountsNotConnected")}
        </p>
        <ConnectFacebookAdsButton
          isPending={isPending}
          label={t("ads.connectAccounts.connectAdAccount")}
          onConnect={onConnect}
        />
      </div>
    ),
    needsReconnect: (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <span>{t("ads.connectAccounts.adAccountsReconnectBanner")}</span>
        <ConnectFacebookAdsButton
          isPending={isPending}
          label={t("ads.connectAccounts.reconnect")}
          onConnect={onConnect}
          variant="outline"
        />
      </div>
    ),
    connected: <ConnectedAdAccounts workspaceId={workspaceId} />,
  } satisfies Record<AdAccountsState, ReactNode>

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-lg">
          {t("ads.connectAccounts.adAccountsTitle")}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {t("ads.connectAccounts.adAccountsDescription")}
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 px-4">
          {stateContent[state]}
          <p className="text-muted-foreground text-xs">
            {t("ads.connectAccounts.adAccountsNote")}
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
