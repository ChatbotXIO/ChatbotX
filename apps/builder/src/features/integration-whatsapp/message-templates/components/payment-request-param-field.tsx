"use client"

import {
  type ParameterInfo,
  type PaymentRequestMethod,
  paymentRequestFieldNames,
} from "@chatbotx.io/flow-config"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type PaymentRequestParamFieldProps = {
  param: ParameterInfo
  fieldName: string
}

/** The notice, besides the general one, that applies to a payment method. */
const METHOD_NOTICE: Partial<Record<PaymentRequestMethod, string>> = {
  card_on_file: "cardOnFile",
}

/**
 * The per-customer values of a payment request button. The payment method and
 * button label come from the synced template, so the user only fills what
 * their payment provider generates for each customer — each value accepts
 * `{{variables}}` so flows can pull it from an earlier step.
 */
export function PaymentRequestParamField({
  param,
  fieldName,
}: PaymentRequestParamFieldProps) {
  const t = useTranslations()
  const { watch } = useFormContext()
  const method = param.paymentMethod
  // The editors read their starting value once, when they mount. After a
  // template change the form is reset to the new method's blank request, so
  // they must mount only once the stored method matches — otherwise they
  // would keep showing the old template's values.
  const storedMethod = watch(`${fieldName}.payment_request.method`)
  if (!method || storedMethod !== method) {
    return null
  }

  const methodNotice = METHOD_NOTICE[method]
  const notices = ["general", ...(methodNotice ? [methodNotice] : [])]

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="font-medium text-xs">
        {t(`whatsapp.messageTemplate.params.payment.method.${method}`)}
      </p>
      {paymentRequestFieldNames(method).map((field) => (
        <div className="space-y-1" key={field}>
          <Label className="text-xs">
            {t(`whatsapp.messageTemplate.params.payment.field.${field}`)}
          </Label>
          <TiptapEditorField
            channels={["whatsapp"]}
            includeBotFieldVariables
            name={`${fieldName}.payment_request.${field}`}
            placeholder=""
            showEmojiPicker={false}
          />
        </div>
      ))}
      <ul className="space-y-1 text-muted-foreground text-xs">
        {notices.map((notice) => (
          <li className="flex items-start gap-1.5" key={notice}>
            <InfoIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
            <span>
              {t(`whatsapp.messageTemplate.params.payment.notice.${notice}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
