/**
 * Low-level, dependency-free wire-adjacent types for Meta's Conversions API
 * for Business Messaging. Lives here (not `packages/business`) so
 * `integrations/meta-conversions` — which deliberately does NOT depend on
 * `@chatbotx.io/business` — can still import these shapes, and so
 * `packages/database`'s `AdsConversionEvent.contents` column can use the same
 * type its writers do.
 */

/**
 * Hash-only Meta Conversions API `user_data` customer-information fields.
 * Every present field is a SHA-256 lowercase-hex digest, wrapped in a
 * single-element array, per Meta's Customer Information Parameters spec
 * (https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters).
 * Never plaintext PII — values are produced by the contact→hash mapper in
 * `packages/business/src/meta-conversions/hash-user-data.ts`; this type only
 * pins the wire shape both that mapper and the channel payload builders
 * (`integrations/meta-conversions/src/apis/events.ts`,
 * `integrations/whatsapp/src/api/conversions.ts`) agree on.
 */
export type HashedCapiUserData = {
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  external_id?: string[]
}

/**
 * One Purchase `custom_data.contents[]` line item. `itemPrice` mirrors
 * Meta's wire `item_price` in camelCase — converted to the wire key at the
 * payload-builder boundary, matching every other camelCase-in/snake_case-out
 * field in the CAPI payload builders.
 */
export type PurchaseContentItem = {
  id: string
  quantity: number
  itemPrice: number
}
