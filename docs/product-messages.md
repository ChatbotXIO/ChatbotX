# Product messages (`sendProducts` flow step)

Sends products from the workspace catalog to a contact from inside a flow, as
one of two displays:

| Display | What the contact gets |
|---------|-----------------------|
| `products` | One product, or a list grouped in sections (1 product → single-product message, 2+ → multi-product message) |
| `carousel` | 2+ products as scrollable cards, body text only |

To open the whole catalog, use the separate `sendViewCatalog` step.

WhatsApp is the first channel. The step and its data are channel-neutral; a
channel is added by declaring a policy entry and a converter, not by changing
shared code.

## How it works

```
flow step (productIds) ──► send-flow-step ──► productMessageService.resolveForSend
                                │                       │ connection + products lookup
                                │                       ▼
                                │            ResolvedProductMessage (retailer ids, snapshot)
                                ▼                       │
                  Message row (contentAttributes.product_message) ◄─┘
                                │
                                ▼
                 integration `sendFlowStep` (data.productMessage) ──► channel API
```

- The step stores **ChatbotX product ids** (`sections[].productIds`). They survive SKU changes and catalog re-syncs; the
  channel-side id (`retailerId`) is resolved at send time.
- Resolution runs **before** the Message row is created. A step that cannot be
  sent (no catalog, nothing sendable, invalid as authored) creates no message and
  is recorded once through the existing `message:failed` → ErrorLog path.
- Products that are no longer sendable (deleted, inactive, unlinked, other
  catalog) are dropped; the message is sent with what is left and one ErrorLog
  entry lists the dropped ids (not written for broadcast/sequence sends, like
  every other failure there). If too few remain for the display, the step fails.
- The message stores a **snapshot** of what was sent, so the inbox stays correct
  after products change or are deleted.

## Where it lives

| Layer | Path |
|-------|------|
| Step schema, structural rules | `packages/flow-config/src/steps/send-products.ts` |
| Per-channel rules (the one table every layer reads) | `packages/flow-config/src/channel-rules/policies/whatsapp.ts` → `productMessages`; evaluator `channel-rules/product-message-rules.ts` |
| Publish/import validation | `channel-rules/send-products-validator.ts` (one override generated per channel that declares `productMessages`) |
| Flow-spec DSL for agents | `packages/flow-config/src/authoring/` (`sendProducts`), rules exposed by `capabilities.get` |
| Catalog lookup | `packages/database/src/repositories/meta-catalog-item/repository.ts` (`listSendableProducts`, `findSendableByProductIds`) |
| Resolution, listing | `packages/business/src/product-message/` (`catalog-sources.ts` maps a channel to its catalog source) |
| Transport types | `packages/sdk/src/lib/shared/message.ts` (`ResolvedProductMessage`, `MessageProductEntity`), `productMessage` on `sendFlowStep` data |
| Worker | `apps/worker/src/chat/handlers/send-flow-step.ts` |
| WhatsApp payloads | `integrations/whatsapp/src/handlers/message/outgoing-message/send-products.ts` |
| Builder | `apps/builder/src/features/flows/react-flow/steps/send-products/`, inbox bubble `features/messages/components/product-message-bubble.tsx` |
| Public API | `GET /v1/products/sendable` (`products.listSendable`, scope `ecommerce`) |

## Sendable products

A product can be sent on a channel when it is **active**, belongs to the
workspace, and is linked in the workspace's **current** Meta Catalog
(`MetaCatalogItem` for the connection's `catalogId`). Products with variants are
not synced to Meta, so they are not sendable. The picker, the public API and the
send path all use the same query scope.

## WhatsApp rules (Meta Cloud API)

Values live in `policies/whatsapp.ts`; the payloads follow Meta's
[catalog message docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/).

| Display | `interactive.type` | Rules |
|---------|--------------------|-------|
| 1 product | `product` | `catalog_id` + `product_retailer_id`; optional body/footer; no header |
| 2+ products | `product_list` | Header (≤60) and body (≤1024) required; footer ≤60; ≤30 products; section title ≤24 and required with 2+ sections; ≤10 sections (a ChatbotX limit — Meta states none) |
| `carousel` | `carousel` | 2–10 product cards, body only (≤1024) |

- These are service messages: they can only be sent inside an open customer
  conversation (24h window), never as notifications.
- The catalog must be connected to the WhatsApp business account, and visible for
  the number (Commerce Settings), or Meta rejects the send / the "View catalog"
  button shows an invalid-catalog warning.
- Nothing is truncated: limits are enforced at publish, and again before dispatch.

## Adding a channel or a display

1. Add a `productMessages` table to the channel's policy (`defineChannelFlowPolicy`)
   and `sendProducts` to its `supported` steps. The validator, the editor, the
   public capabilities and the business re-check all read that table.
2. Map the channel to a catalog source in `catalog-sources.ts` (add a source if it
   is not Meta's catalog).
3. Convert `data.productMessage` to the channel's payload in the integration, and
   add the step to its `handledFlowStepTypes` (the policy contract test enforces
   both directions).

## Known limitations

- Flow-step sends are terminal on failure (no automatic retry): a transient Meta
  error drops that message and shows in Error Logs.
- Meta reports most WhatsApp API errors as `OAuthException`, which the shared
  error mapper classes as `AUTH_FAILED` ahead of the specific code, so an unknown
  product shows as an authentication error in the log. This is existing mapper
  behavior shared with template sends and has no side effect on the connection.
- A multi-product header/body or a section title that stops being
  allowed because products were dropped is omitted rather than failing the send.
