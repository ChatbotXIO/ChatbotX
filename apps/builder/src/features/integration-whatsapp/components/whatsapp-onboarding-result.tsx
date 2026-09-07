"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { RefObject } from "react"
import QRCode from "react-qr-code"
import { useClipboard } from "@/hooks/use-clipboard"
import type { ManualOnboardingResult } from "../schema"

type WhatsappOnboardingResultProps = {
  results: ManualOnboardingResult[]
  titleRef?: RefObject<HTMLHeadingElement | null>
  /**
   * Completes the stage sequence — routed through the single-number stage
   * hook's `advance()` (inline path) or the dialog's finish path (batch),
   * so the final redirect always goes through that one controlled place
   * instead of a raw `<Link>` navigation. The per-number "more settings"
   * link stays a real `<Link>` — it's meant to let the operator configure
   * something and come back, not finish the flow.
   */
  onDone: () => void
  /** The dialog that hosts this step is already leaving — `onDone` is spent. */
  isDone?: boolean
}

type CopyableFieldProps = {
  label: string
  value: string
  onCopy: () => void
}

/**
 * Shows the webhook URL / verify token / QR code for every manually
 * connected WhatsApp number in one batch. Every number in a batch shares the
 * same workspace (one signup session, one workspace), so a single "go to
 * inbox" link at the bottom is enough — only the per-number webhook details
 * repeat.
 */
export function WhatsappOnboardingResult({
  results,
  titleRef,
  onDone,
  isDone = false,
}: WhatsappOnboardingResultProps) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const [first] = results

  if (!first) {
    return null
  }

  const isMulti = results.length > 1

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="font-semibold text-lg" ref={titleRef} tabIndex={-1}>
          {t(
            isMulti
              ? "whatsapp.manualOnboarding.multipleTitle"
              : "whatsapp.manualOnboarding.title",
          )}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("whatsapp.manualOnboarding.description")}
        </p>
      </div>

      <div className="space-y-6">
        {results.map((result) => (
          <div
            className="space-y-4 rounded-md border p-4"
            key={result.integrationId}
          >
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
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`/space/${result.workspaceId}/whatsapps/${result.integrationId}/useful-links`}
              >
                {t("whatsapp.manualOnboarding.moreSettings")}
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          disabled={isDone}
          onClick={onDone}
          size="sm"
          type="button"
          variant="default"
        >
          {t("whatsapp.manualOnboarding.goToInbox")}
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
