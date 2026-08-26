"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { useTranslations } from "next-intl"
import { PurchaseContentsField } from "./purchase-contents-field"

type PurchaseEnrichmentFieldsProps = {
  parentName: string
}

/**
 * `order_id` + `contents[]` fields (plan #4) shared by the Trigger
 * `trackAdsPurchase` action (`track-ads-purchase-fields.tsx`) and the
 * `trackAdsPurchase` flow step (`track-ads-purchase/editor.tsx`) — both
 * STATIC config, mirroring how `CapiValueCurrencyFields` is shared between
 * them for value/currency.
 */
export const PurchaseEnrichmentFields = ({
  parentName,
}: PurchaseEnrichmentFieldsProps) => {
  const t = useTranslations()

  return (
    <>
      <InputField
        label={t("metaConversions.fields.orderId")}
        name={`${parentName}.orderId`}
        placeholder={t("metaConversions.fields.orderIdPlaceholder")}
      />
      <PurchaseContentsField parentName={parentName} />
    </>
  )
}
