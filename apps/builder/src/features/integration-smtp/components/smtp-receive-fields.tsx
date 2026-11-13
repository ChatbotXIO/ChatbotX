"use client"

import {
  imapHostMap,
  type smtpProviders,
} from "@chatbotx.io/integration-smtp/schema"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import type { z } from "zod"
import { InboundWebhookBox } from "./inbound-webhook-box"

type SmtpProvider = z.infer<typeof smtpProviders>

type SmtpReceiveFieldsProps = {
  readonly provider: SmtpProvider
  readonly workspaceId: string
  readonly integrationSmtpId?: string
}

/**
 * How this inbox receives mail: an IMAP mailbox (toggle, plus host/port for a
 * custom server) or, for relay providers with no mailbox, an inbound webhook.
 */
export const SmtpReceiveFields = ({
  provider,
  workspaceId,
  integrationSmtpId,
}: SmtpReceiveFieldsProps) => {
  const t = useTranslations()
  const { watch } = useFormContext()

  if (provider === "amazon_ses") {
    return (
      <p className="text-muted-foreground text-sm">
        {t("smtp.guide.sendOnly")}
      </p>
    )
  }

  if (imapHostMap[provider] === null) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          {t("smtp.guide.relayReceive")}
        </p>
        <InboundWebhookBox
          integrationSmtpId={integrationSmtpId}
          workspaceId={workspaceId}
        />
      </div>
    )
  }

  const isImapEnabled = Boolean(watch("imap.enabled"))

  return (
    <div className="space-y-4">
      <SwitchField
        description={t("smtp.guide.receiveImapDescription")}
        label={t("smtp.guide.receiveImap")}
        name="imap.enabled"
      />
      {isImapEnabled && provider === "other" && (
        <div className="flex gap-2">
          <InputField
            formItemClassName="flex-1"
            label={t("smtp.guide.imapHost")}
            name="imap.host"
            placeholder="imap.example.com"
            required
          />
          <InputField
            formItemClassName="w-24"
            label={t("smtp.guide.imapPort")}
            name="imap.port"
            placeholder="993"
            required
            type="number"
          />
        </div>
      )}
    </div>
  )
}
