"use client"

import { CapiValueCurrencyFields } from "@/features/meta-conversions/components/capi-value-currency-fields"
import { PurchaseEnrichmentFields } from "@/features/meta-conversions/components/purchase-enrichment-fields"

type TrackAdsPurchaseFieldsProps = {
  parentName: string
}

// Minimal, purpose-built form for the `trackAdsPurchase` trigger action —
// deliberately NOT `CapiEventFields` (see track-ads-purchase.ts): that
// component hardcodes LeadSubmitted event-type semantics and exposes
// content fields (contentName/contentCategory) that are irrelevant here.
// This action only ever supports STATIC value/currency/orderId/contents.
export const TrackAdsPurchaseFields = ({
  parentName,
}: TrackAdsPurchaseFieldsProps) => (
  <div className="mt-2 flex flex-col gap-4">
    <CapiValueCurrencyFields parentName={parentName} />
    <PurchaseEnrichmentFields parentName={parentName} />
  </div>
)
