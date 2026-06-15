"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import QRCode from "react-qr-code"
import { useClipboard } from "@/hooks/use-clipboard"
import type { ManualOnboardingResult } from "../schemas"

type WhatsappOnboardingResultProps = {
  result: ManualOnboardingResult
}

type CopyableFieldProps = {
  label: string
  value: string
  onCopy: () => void
}

export function WhatsappOnboardingResult({
  result,
}: WhatsappOnboardingResultProps) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="font-semibold text-lg">
          {t("whatsapp.manualOnboarding.title")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("whatsapp.manualOnboarding.description")}
        </p>
      </div>

      <CopyableField
        label={t("whatsapp.manualOnboarding.webhookUrl")}
        onCopy={() => handleCopy(result.webhookUrl)}
        value={result.webhookUrl}
      />

      <CopyableField
        label={t("whatsapp.manualOnboarding.verifyToken")}
        onCopy={() => handleCopy(result.verifyToken)}
        value={result.verifyToken}
      />

      <div className="flex flex-col items-center gap-2">
        <p className="text-muted-foreground text-sm">
          {t("whatsapp.manualOnboarding.qrCodeHint")}
        </p>
        <div className="rounded-md bg-white p-3">
          <QRCode size={180} value={result.webhookUrl} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button asChild size="sm" type="button" variant="outline">
          <Link
            href={`/space/${result.workspaceId}/whatsapps/${result.integrationId}/useful-links`}
          >
            {t("whatsapp.manualOnboarding.moreSettings")}
          </Link>
        </Button>
        <Button asChild size="sm" type="button" variant="default">
          <Link href={`/space/${result.workspaceId}/inbox`}>
            {t("whatsapp.manualOnboarding.goToInbox")}
          </Link>
        </Button>
      </div>
    </div>
  )
}

function CopyableField({ label, value, onCopy }: CopyableFieldProps) {
  const t = useTranslations()
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input className="font-mono text-xs" readOnly value={value} />
        <Button
          aria-label={t("actions.copyUrl")}
          onClick={onCopy}
          size="icon"
          type="button"
          variant="secondary"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
