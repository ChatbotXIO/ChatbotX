"use client"

import { SHOPIFY_REQUIRED_SCOPES } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import { connectShopifyAction } from "../actions/connect-shopify.action"
import { disconnectShopifyAction } from "../actions/disconnect-shopify.action"
import { syncShopifyAction } from "../actions/sync-shopify.action"
import {
  connectShopifyRequest,
  type shopifyStatusResource,
} from "../schema/public"

type ShopifyStatus = z.infer<typeof shopifyStatusResource>
type ConnectedShopifyStatus = Extract<ShopifyStatus, { connected: true }>

const AUTH_KINDS = ["token", "clientCredentials"] as const
type AuthKind = (typeof AUTH_KINDS)[number]

/** How often the page reloads the status while a sync is still running. */
const SYNC_POLL_INTERVAL_MS = 3000

type ConnectFormValues = {
  authKind: AuthKind
  shopDomain: string
  accessToken: string
  apiSecret: string
  clientId: string
  clientSecret: string
}

const toConnectRequest = (values: ConnectFormValues) =>
  values.authKind === "token"
    ? {
        authKind: values.authKind,
        shopDomain: values.shopDomain,
        accessToken: values.accessToken,
        apiSecret: values.apiSecret,
      }
    : {
        authKind: values.authKind,
        shopDomain: values.shopDomain,
        clientId: values.clientId,
        clientSecret: values.clientSecret,
      }

/** The Shopify tab: connect a store, or show the connected one and its sync. */
export function ShopifySettingsForm({
  workspaceId,
  status,
}: {
  workspaceId: string
  status: ShopifyStatus
}) {
  return status.connected ? (
    <ConnectedShopify status={status} workspaceId={workspaceId} />
  ) : (
    <ConnectShopify webhookUrl={status.webhookUrl} workspaceId={workspaceId} />
  )
}

/** The webhook address with a copy button. */
function WebhookUrlRow({ webhookUrl }: { webhookUrl: string }) {
  const t = useTranslations("ecommerceSettings.shopify")
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

function ConnectShopify({
  workspaceId,
  webhookUrl,
}: {
  workspaceId: string
  webhookUrl: string
}) {
  const t = useTranslations("ecommerceSettings.shopify")
  const tCommon = useTranslations()
  const router = useRouter()
  const { execute, isPending } = useAction(
    connectShopifyAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          tCommon("messages.connectSuccess", { feature: "Shopify" }),
        )
        router.refresh()
      },
      onError: toastActionError(
        tCommon("messages.connectFailed", { feature: "Shopify" }),
      ),
    },
  )
  const resolver = useRequestResolver<ConnectFormValues>({
    schema: connectShopifyRequest,
    toRequest: toConnectRequest,
  })
  const form = useForm<ConnectFormValues>({
    resolver,
    defaultValues: {
      authKind: "token",
      shopDomain: "",
      accessToken: "",
      apiSecret: "",
      clientId: "",
      clientSecret: "",
    },
  })
  const authKind = form.watch("authKind")

  const onSubmit = form.handleSubmit((values) =>
    execute(connectShopifyRequest.parse(toConnectRequest(values))),
  )

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <SettingRow
          description={t("shopDomain.hint")}
          label={t("shopDomain.label")}
        >
          <InputField
            autoComplete="off"
            name="shopDomain"
            placeholder={t("shopDomain.placeholder")}
          />
        </SettingRow>
        <SettingRow
          description={t("authKind.description")}
          label={t("authKind.label")}
        >
          <SelectField
            name="authKind"
            options={AUTH_KINDS.map((kind) => ({
              value: kind,
              label: t(`authKind.options.${kind}`),
            }))}
          />
        </SettingRow>
        {authKind === "token" ? (
          <>
            <SettingRow
              description={t("accessToken.hint", {
                scopes: SHOPIFY_REQUIRED_SCOPES.join(", "),
              })}
              label={t("accessToken.label")}
            >
              <InputField
                autoComplete="off"
                name="accessToken"
                type="password"
              />
            </SettingRow>
            <SettingRow
              description={t("apiSecret.hint")}
              label={t("apiSecret.label")}
            >
              <InputField autoComplete="off" name="apiSecret" type="password" />
            </SettingRow>
          </>
        ) : (
          <>
            <SettingRow
              description={t("clientId.hint", {
                scopes: SHOPIFY_REQUIRED_SCOPES.join(", "),
              })}
              label={t("clientId.label")}
            >
              <InputField autoComplete="off" name="clientId" />
            </SettingRow>
            <SettingRow
              description={t("clientSecret.hint")}
              label={t("clientSecret.label")}
            >
              <InputField
                autoComplete="off"
                name="clientSecret"
                type="password"
              />
            </SettingRow>
          </>
        )}
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

function ConnectedShopify({
  workspaceId,
  status,
}: {
  workspaceId: string
  status: ConnectedShopifyStatus
}) {
  const t = useTranslations("ecommerceSettings.shopify")
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
    syncShopifyAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("syncStarted"))
        router.refresh()
      },
      onError: toastActionError(t("syncError")),
    },
  )
  const { execute: disconnect, isPending: isDisconnecting } = useAction(
    disconnectShopifyAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        setDisconnectOpen(false)
        toast.success(
          tCommon("messages.disconnectSuccess", { feature: "Shopify" }),
        )
        router.refresh()
      },
      onError: toastActionError(tCommon("messages.unknownError")),
    },
  )

  return (
    <div className="space-y-4">
      <SettingRow
        description={t("shopDomain.connectedHint")}
        label={t("shopDomain.label")}
      >
        <Input readOnly value={status.shopDomain} />
      </SettingRow>
      <SettingRow
        description={t("accessToken.connectedHint")}
        label={t("accessToken.label")}
      >
        <div className="space-y-2">
          <Input readOnly type="password" value="••••••••••••••••" />
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
              featureLabel="Shopify"
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
          <p>
            {t("syncStatus.connectedTo", { shopDomain: status.shopDomain })}
          </p>
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
