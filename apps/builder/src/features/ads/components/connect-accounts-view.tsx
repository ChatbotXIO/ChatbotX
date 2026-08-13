"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CircleCheckIcon,
  CircleHelpIcon,
  type LucideIcon,
  MessageCircleIcon,
  MousePointerClickIcon,
  TriangleAlertIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import {
  getPermissionStatus,
  type PermissionStatus,
  permissionStatusConfig,
} from "../lib/permission-status"
import { resolveSelectedIntegration } from "../lib/select-account"
import type { ConnectAccountsData } from "../queries/connect-accounts"
import { AdAccountsSection } from "./ad-accounts-section"
import { WhatsappReconnectButton } from "./ads-account-switcher"

type ConnectAccountsViewProps = {
  workspaceId: string
  promises: Promise<[ConnectAccountsData]>
  selectedAccount: string
}

const permissionStatusIconConfig = {
  ready: { icon: CircleCheckIcon, className: "text-emerald-600" },
  missingPermission: { icon: TriangleAlertIcon, className: "text-amber-600" },
  unverified: { icon: CircleHelpIcon, className: "text-muted-foreground" },
} as const satisfies Record<
  PermissionStatus,
  { icon: LucideIcon; className: string }
>

function PermissionStatusIcon({ status }: { status: PermissionStatus }) {
  const t = useTranslations()
  const label = t(permissionStatusConfig[status].labelKey)
  const { icon: Icon, className } = permissionStatusIconConfig[status]

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span aria-label={label} className="inline-flex" role="img">
            <Icon className={cn("size-5", className)} />
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ConnectWhatsappEmptyState({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const steps = [
    t("ads.connectAccounts.connectWhatsapp.step1"),
    t("ads.connectAccounts.connectWhatsapp.step2"),
    t("ads.connectAccounts.connectWhatsapp.step3"),
  ]

  return (
    <div className="flex justify-center py-10">
      <Card className="w-full max-w-2xl">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted">
              <MessageCircleIcon className="size-5 text-muted-foreground" />
            </span>
            <span className="text-muted-foreground">-</span>
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10">
              <MousePointerClickIcon className="size-5 text-primary" />
            </span>
          </div>
          <div>
            <h2 className="font-semibold text-lg">
              {t("ads.connectAccounts.connectWhatsapp.title")}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
              {t("ads.connectAccounts.connectWhatsapp.description")}
            </p>
          </div>
          <ol className="flex w-full flex-col gap-2 text-start">
            {steps.map((step, index) => (
              <li
                className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm"
                key={step}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <Link
            className={buttonVariants()}
            href={`/space/${workspaceId}/settings/channels`}
          >
            {t("ads.connectAccounts.connectWhatsapp.cta")}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function WhatsappAccountsManager({
  data,
  selectedAccount,
  workspaceId,
}: {
  data: ConnectAccountsData
  selectedAccount: string
  workspaceId: string
}) {
  const t = useTranslations()
  const selectedIntegration = resolveSelectedIntegration(
    data.whatsappIntegrations,
    selectedAccount,
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-xl">
            {t("ads.connectAccounts.title")}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("ads.connectAccounts.description")}
          </p>
        </div>
      </div>

      {data.whatsappIntegrations.length === 0 && (
        <ConnectWhatsappEmptyState workspaceId={workspaceId} />
      )}

      {data.whatsappIntegrations.length > 0 && (
        <Card>
          <CardContent className="px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ads.connectAccounts.table.name")}</TableHead>
                  <TableHead>
                    {t("ads.connectAccounts.table.phoneNumber")}
                  </TableHead>
                  <TableHead>{t("ads.connectAccounts.table.wabaId")}</TableHead>
                  <TableHead className="text-center">
                    {t("ads.connectAccounts.table.permission")}
                  </TableHead>
                  <TableHead className="text-end">
                    {t("ads.connectAccounts.reconnect")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.whatsappIntegrations.map((integration) => {
                  const status = getPermissionStatus(
                    integration,
                    data.whatsappCredentialPublic,
                  )

                  return (
                    <TableRow
                      className={cn(
                        selectedIntegration?.id === integration.id &&
                          "bg-accent/40",
                      )}
                      data-state={
                        selectedIntegration?.id === integration.id
                          ? "selected"
                          : undefined
                      }
                      key={integration.id}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <MousePointerClickIcon className="size-4 shrink-0 text-primary" />
                          {integration.name}
                        </span>
                      </TableCell>
                      <TableCell>{integration.displayPhoneNumber}</TableCell>
                      <TableCell>{integration.wabaId}</TableCell>
                      <TableCell>
                        <span className="flex justify-center">
                          <PermissionStatusIcon status={status} />
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <WhatsappReconnectButton
                          disabled={status !== "missingPermission"}
                          integrationWhatsappId={integration.id}
                          settings={data.whatsappCredentialPublic}
                          workspaceId={workspaceId}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AdAccountsSection
        facebookAds={data.facebookAds}
        workspaceId={workspaceId}
      />
    </div>
  )
}

export function ConnectAccountsView({
  workspaceId,
  promises,
  selectedAccount,
}: ConnectAccountsViewProps) {
  const [data] = use(promises)

  return (
    <WhatsappAccountsManager
      data={data}
      selectedAccount={selectedAccount}
      workspaceId={workspaceId}
    />
  )
}
