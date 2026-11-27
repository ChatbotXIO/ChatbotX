"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import type { z } from "zod"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { SettingRow } from "@/features/ecommerce-settings/components/setting-row"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { useRequestResolver } from "@/lib/validation/use-request-resolver"
import { connectWooCommerceAction } from "../actions/connect-woocommerce.action"
import { disconnectWooCommerceAction } from "../actions/disconnect-woocommerce.action"
import { syncWooCommerceAction } from "../actions/sync-woocommerce.action"
import {
  type ConnectWooCommerceRequest,
  connectWooCommerceRequest,
  type wooCommerceStatusResource,
} from "../schema/public"

type WooCommerceStatus = z.infer<typeof wooCommerceStatusResource>
type ConnectedWooCommerceStatus = Extract<
  WooCommerceStatus,
  { connected: true }
>

/** How often the page reloads the status while a sync is still running. */
const SYNC_POLL_INTERVAL_MS = 3000

const FEATURE_NAME = "WooCommerce"

/** The WooCommerce tab: connect a store, or show the connected one and its sync. */
export function WooCommerceSettingsForm({
  workspaceId,
  status,
}: {
  workspaceId: string
  status: WooCommerceStatus
}) {
  return status.connected ? (
    <ConnectedWooCommerce status={status} workspaceId={workspaceId} />
  ) : (
    <ConnectWooCommerce
      webhookUrl={status.webhookUrl}
      workspaceId={workspaceId}
    />
  )
}

/** The webhook address with a copy button. */
function WebhookUrlRow({ webhookUrl }: { webhookUrl: string }) {
  const t = useTranslations("ecommerceSettings.woocommerce")
  const tCommon = useTranslations()
  const [, copyToClipboard] = useCopyToClipboard()
  const onCopy = () => {
    copyToClipboard(webhookUrl).then(() => {
      toast.success(tCommon("messages.copiedToClipboard"))
    })
  }
  return (
    <SettingRow
      description={t("webhookUrl.description")}
      label={t("webhookUrl.label")}
    >
      <div className="flex gap-2">
        <Input readOnly value={webhookUrl} />
        <Button
          aria-label={tCommon("actions.copy")}
          onClick={onCopy}
          size="icon"
          type="button"
          variant="secondary"
        >
          <CopyIcon />
        </Button>
      </div>
    </SettingRow>
  )
}

function ConnectWooCommerce({
  workspaceId,
  webhookUrl,
}: {
  workspaceId: string
  webhookUrl: string
}) {
  const t = useTranslations("ecommerceSettings.woocommerce")
  const tCommon = useTranslations()
  const router = useRouter()
  const { execute, isPending } = useAction(
    connectWooCommerceAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          tCommon("messages.connectSuccess", { feature: FEATURE_NAME }),
        )
        router.refresh()
      },
      onError: toastActionError(
        tCommon("messages.connectFailed", { feature: FEATURE_NAME }),
      ),
    },
  )
  const resolver = useRequestResolver<ConnectWooCommerceRequest>({
    schema: connectWooCommerceRequest,
    toRequest: (values) => values,
  })
  const form = useForm<ConnectWooCommerceRequest>({
    resolver,
    defaultValues: { siteUrl: "", consumerKey: "", consumerSecret: "" },
  })

  const onSubmit = form.handleSubmit((values) =>
    execute(connectWooCommerceRequest.parse(values)),
  )

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <SettingRow description={t("siteUrl.hint")} label={t("siteUrl.label")}>
          <InputField
            autoComplete="off"
            name="siteUrl"
            placeholder={t("siteUrl.placeholder")}
            type="url"
          />
        </SettingRow>
        <SettingRow
          description={t("consumerKey.hint")}
          label={t("consumerKey.label")}
        >
          <InputField
            autoComplete="off"
            name="consumerKey"
            placeholder="ck_…"
            type="password"
          />
        </SettingRow>
        <SettingRow
          description={t("consumerSecret.hint")}
          label={t("consumerSecret.label")}
        >
          <InputField
            autoComplete="off"
            name="consumerSecret"
            placeholder="cs_…"
            type="password"
          />
        </SettingRow>
        <WebhookUrlRow webhookUrl={webhookUrl} />
        <div className="flex justify-end">
          <Button disabled={isPending} type="submit">
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {tCommon("actions.connect")}
          </Button>
        </div>
      </form>
    </Form>
  )
}

function ConnectedWooCommerce({
  workspaceId,
  status,
}: {
  workspaceId: string
  status: ConnectedWooCommerceStatus
}) {
  const t = useTranslations("ecommerceSettings.woocommerce")
  const tCommon = useTranslations()
  const format = useFormatter()
  const router = useRouter()
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const isSyncing =
    status.syncStatus === "queued" || status.syncStatus === "running"
  // The sync runs in the worker; reload the status until it settles.
  useEffect(() => {
    if (!isSyncing) {
      return
    }
    const timer = setInterval(() => router.refresh(), SYNC_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isSyncing, router])

  const { execute: sync, isPending: isRequestingSync } = useAction(
    syncWooCommerceAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("syncStarted"))
        router.refresh()
      },
      onError: toastActionError(t("syncError")),
    },
  )
  const { execute: disconnect, isPending: isDisconnecting } = useAction(
    disconnectWooCommerceAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        setDisconnectOpen(false)
        toast.success(
          tCommon("messages.disconnectSuccess", { feature: FEATURE_NAME }),
        )
        router.refresh()
      },
      onError: toastActionError(tCommon("messages.unknownError")),
    },
  )

  const storeLabel = status.storeName ?? status.siteUrl

  return (
    <div className="space-y-4">
      <SettingRow
        description={t("siteUrl.connectedHint")}
        label={t("siteUrl.label")}
      >
        <Input readOnly value={status.siteUrl} />
      </SettingRow>
      <SettingRow
        description={t("consumerKey.connectedHint")}
        label={t("consumerKey.label")}
      >
        <div className="space-y-2">
          <Input readOnly value={status.consumerKeyHint} />
          <div className="flex gap-2">
            <Button
              disabled={isRequestingSync || isSyncing}
              onClick={() => sync({ scope: "all" })}
              size="sm"
              type="button"
            >
              {isRequestingSync || isSyncing ? (
                <Loader2Icon className="animate-spin" />
              ) : null}
              {t("syncNow")}
            </Button>
            <DisconnectIntegrationDialog
              featureLabel={FEATURE_NAME}
              isPending={isDisconnecting}
              onConfirm={() => disconnect()}
              onOpenChange={setDisconnectOpen}
              open={disconnectOpen}
            />
          </div>
        </div>
      </SettingRow>
      <SettingRow
        description={t("syncStatus.description")}
        label={t("syncStatus.label")}
      >
        <div className="space-y-1 text-sm">
          <p>{t("syncStatus.connectedTo", { store: storeLabel })}</p>
          <p className="text-muted-foreground">
            {status.lastSyncedAt
              ? t("syncStatus.lastSynced", {
                  time: format.relativeTime(status.lastSyncedAt),
                  productCount: status.productCount,
                  orderCount: status.orderCount,
                })
              : t("syncStatus.neverSynced")}
          </p>
          <p className="text-muted-foreground">
            {t(`syncStatus.state.${status.syncStatus}`)}
          </p>
          {status.syncError ? (
            <p className="text-destructive">{status.syncError}</p>
          ) : null}
          {status.status === "invalid" ? (
            <p className="text-destructive">
              {t("syncStatus.invalid", {
                reason: status.statusReason ?? t("syncStatus.noReason"),
              })}
            </p>
          ) : null}
        </div>
      </SettingRow>
      <WebhookUrlRow webhookUrl={status.webhookUrl} />
    </div>
  )
}
