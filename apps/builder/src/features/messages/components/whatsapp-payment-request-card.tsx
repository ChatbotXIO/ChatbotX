"use client"

import type { PaymentRequestMethod } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  BarcodeIcon,
  CopyIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  LinkIcon,
  type LucideIcon,
  QrCodeIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import {
  formatPaymentRequestAmount,
  isOpenableUrl,
  paymentRequestMainValue,
  type SentPaymentRequest,
} from "../lib/payment-request-content"

const METHOD_ICON: Record<PaymentRequestMethod, LucideIcon> = {
  pix: QrCodeIcon,
  boleto: BarcodeIcon,
  payment_link: LinkIcon,
  card_on_file: CreditCardIcon,
}

const METHOD_LABEL_KEY = {
  pix: "whatsapp.messageTemplate.params.payment.method.pix",
  boleto: "whatsapp.messageTemplate.params.payment.method.boleto",
  payment_link: "whatsapp.messageTemplate.params.payment.method.payment_link",
  card_on_file: "whatsapp.messageTemplate.params.payment.method.card_on_file",
} as const satisfies Record<PaymentRequestMethod, string>

/** Label of the field holding the value the customer copies or opens. */
const MAIN_VALUE_LABEL_KEY = {
  pix: "whatsapp.messageTemplate.params.payment.field.code",
  boleto: "whatsapp.messageTemplate.params.payment.field.digitableLine",
  payment_link: "whatsapp.messageTemplate.params.payment.field.url",
} as const

/**
 * What a sent payment request asked the customer to pay: method, amount and
 * the value they copy or open, so the agent sees it without opening the
 * template. WhatsApp never reports whether a Pix, Boleto or link was paid
 * (reconciliation is the payment provider's), so the card states that instead
 * of inventing a status.
 */
export function WhatsappPaymentRequestCard({
  requests,
  templateName,
}: {
  requests: SentPaymentRequest[]
  templateName: string | null
}) {
  const t = useTranslations("messages.paymentRequest")

  return (
    <div className="flex w-80 max-w-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      {requests.map((sent) => (
        <PaymentRequestSection key={sent.index} sent={sent} />
      ))}
      {templateName && (
        <p className="border-t bg-muted/40 px-3 py-1.5 text-muted-foreground text-xs">
          {t("sentFromTemplate", { name: templateName })}
        </p>
      )}
    </div>
  )
}

function PaymentRequestSection({ sent }: { sent: SentPaymentRequest }) {
  const t = useTranslations()
  const locale = useLocale()
  const { request } = sent
  const Icon = METHOD_ICON[request.method]
  const amount = formatPaymentRequestAmount(locale, request)

  return (
    <section className="flex flex-col gap-2 p-3 [&+section]:border-t">
      <header className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-sm leading-tight">
            {t("messages.paymentRequest.title")}
          </span>
          <span className="text-muted-foreground text-xs">
            {t(METHOD_LABEL_KEY[request.method])}
          </span>
        </div>
      </header>

      {amount && (
        <p className="font-semibold text-2xl tabular-nums leading-none">
          {amount}
        </p>
      )}

      {request.method === "card_on_file" ? (
        <p className="text-sm">
          {t("messages.paymentRequest.cardEnding", {
            lastFourDigits: request.lastFourDigits,
          })}
        </p>
      ) : (
        <PaymentValue
          isLink={request.method === "payment_link"}
          label={t(MAIN_VALUE_LABEL_KEY[request.method])}
          value={paymentRequestMainValue(request)}
        />
      )}

      <p className="text-muted-foreground text-xs">
        {request.method === "card_on_file"
          ? t("messages.paymentRequest.cardStatus")
          : t("messages.paymentRequest.status")}
      </p>
    </section>
  )
}

function PaymentValue({
  label,
  value,
  isLink,
}: {
  label: string
  value: string
  isLink: boolean
}) {
  const t = useTranslations()
  const [, copyToClipboard] = useCopyToClipboard()
  const handleCopy = () => {
    copyToClipboard(value).then((copied) => {
      if (copied) {
        toast.success(t("messages.copiedToClipboard"))
      }
    })
  }

  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/60 px-2 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-start gap-1">
        {isLink && isOpenableUrl(value) ? (
          <a
            className="line-clamp-2 min-w-0 flex-1 break-all text-primary text-xs underline-offset-2 hover:underline"
            href={value}
            rel="noopener noreferrer"
            target="_blank"
          >
            {value}
            <ExternalLinkIcon aria-hidden className="ms-1 inline size-3" />
          </a>
        ) : (
          <code className="line-clamp-2 min-w-0 flex-1 break-all font-mono text-xs">
            {value}
          </code>
        )}
        <Button
          aria-label={t("actions.copy")}
          className="size-6 shrink-0"
          onClick={handleCopy}
          size="icon"
          title={t("actions.copy")}
          type="button"
          variant="ghost"
        >
          <CopyIcon aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
