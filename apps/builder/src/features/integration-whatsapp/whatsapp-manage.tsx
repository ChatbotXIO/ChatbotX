"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import type { listIntegrationWhatsapps } from "./queries"
import { WhatsappDisconnectDialog } from "./whatsapp-disconnect-dialog"

type WhatsappManageProps = {
  isEnabled: boolean
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationWhatsapps>>]>
}

// Cor da quality chip baseada no Meta WhatsApp Business API:
//   GREEN  = "Alta qualidade"
//   YELLOW = "Média qualidade — atenção"
//   RED    = "Baixa qualidade — risco de bloqueio"
//   UNKNOWN = sem score ainda (number novo / poucas mensagens)
const QUALITY_CONFIG: Record<
  "GREEN" | "YELLOW" | "RED" | "UNKNOWN",
  { label: string; className: string }
> = {
  GREEN: {
    label: "Alta",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  YELLOW: {
    label: "Média",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  RED: {
    label: "Baixa",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
  },
  UNKNOWN: {
    label: "—",
    className: "bg-white/[0.06] text-text-secondary border-white/[0.12]",
  },
}

// Formata número internacional pra "+1 555 649 0175" estilo Respond.io.
// displayPhoneNumber vem do Meta em vários formatos:
//   "+15556490175"  / "15556490175" / "+1 555-649-0175"
// Padronizo pra "+1 555 649 0175" (espaços, sem traço).
function formatDisplayPhone(raw: string | null | undefined): string {
  if (!raw) {
    return "—"
  }
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 8) {
    return raw
  }
  if (digits.startsWith("1") && digits.length === 11) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  if (digits.startsWith("55") && digits.length >= 12) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, digits.length - 4)} ${digits.slice(-4)}`
  }
  return `+${digits}`
}

type WhatsappPhoneMeta = {
  verified_name?: string
  display_phone_number?: string
  quality_rating?: "GREEN" | "YELLOW" | "RED" | "UNKNOWN"
  code_verification_status?: string
  platform_type?: string
  throughput?: { level?: string }
}

type WhatsappAuthShape = {
  metadata?: {
    isManual?: boolean
    webhookVerifiedAt?: string
    phoneNumber?: WhatsappPhoneMeta
  }
}

export function WhatsappManage({
  isEnabled,
  workspaceId,
  promises,
}: WhatsappManageProps) {
  const [{ data: integrationWhatsapps }] = use(promises)
  const t = useTranslations()

  if (!isEnabled) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          {t("messages.needToAddSettings")}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary">
          <Link
            className="flex items-center gap-2"
            href={`/channels/create?channel=whatsapp&workspaceId=${workspaceId}`}
          >
            <PlusCircleIcon className="h-4 w-4" />
            {t("actions.addFeature", { feature: t("fields.whatsapp.label") })}
          </Link>
        </Button>
      </div>

      {integrationWhatsapps.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-white/[0.08] border-dashed py-12 text-sm text-text-secondary">
          <SiWhatsapp className="size-8 opacity-50" fill={SiWhatsappHex} />
          <p>{t("whatsapp.list.empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {integrationWhatsapps.map((integration) => {
            const auth = integration.auth as WhatsappAuthShape | null
            const phoneMeta = auth?.metadata?.phoneNumber
            const isManual = Boolean(auth?.metadata?.isManual)
            const isWebhookVerified = Boolean(auth?.metadata?.webhookVerifiedAt)
            const quality = (phoneMeta?.quality_rating ?? "UNKNOWN") as
              | "GREEN"
              | "YELLOW"
              | "RED"
              | "UNKNOWN"
            const qualityCfg = QUALITY_CONFIG[quality]
            const verifiedName =
              phoneMeta?.verified_name ||
              integration.inbox?.name ||
              integration.name ||
              "—"
            const displayPhone = formatDisplayPhone(
              phoneMeta?.display_phone_number || integration.displayPhoneNumber,
            )

            return (
              <div
                className="flex flex-col gap-3 rounded-md border border-white/[0.08] bg-card p-4 transition-colors hover:border-white/[0.16]"
                key={integration.id}
              >
                {/* Header card: avatar WhatsApp + nome + quality chip */}
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                    <SiWhatsapp className="size-5" fill={SiWhatsappHex} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="truncate font-semibold text-[14px] text-foreground leading-tight">
                      {verifiedName}
                    </div>
                    <div className="truncate text-[12px] text-text-secondary">
                      {displayPhone}
                    </div>
                  </div>
                  <Badge
                    className={`shrink-0 border px-2 py-0.5 font-medium text-[11px] ${qualityCfg.className}`}
                    variant="outline"
                  >
                    {qualityCfg.label}
                  </Badge>
                </div>

                {/* Status row */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {isManual ? (
                    <Badge
                      className="border-white/[0.12] bg-white/[0.04] text-text-secondary"
                      variant="outline"
                    >
                      {t("whatsapp.connectionType.manual")}
                    </Badge>
                  ) : (
                    <Badge
                      className="border-white/[0.12] bg-white/[0.04] text-text-secondary"
                      variant="outline"
                    >
                      {t("whatsapp.connectionType.embedded")}
                    </Badge>
                  )}
                  <Badge
                    className={
                      isWebhookVerified
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    }
                    variant="outline"
                  >
                    {isWebhookVerified
                      ? t("whatsapp.webhook.verified")
                      : t("whatsapp.webhook.pending")}
                  </Badge>
                </div>

                {/* Footer card: ações */}
                <div className="mt-auto flex items-center justify-end gap-2 border-white/[0.06] border-t pt-3">
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      href={`/space/${workspaceId}/whatsapps/${integration.id}/profile`}
                    >
                      {t("actions.manage")}
                    </Link>
                  </Button>
                  <WhatsappDisconnectDialog
                    integrationWhatsappId={integration.id}
                    workspaceId={workspaceId}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
