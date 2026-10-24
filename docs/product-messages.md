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
flow step (productIds) ──► send-flow-step ──► productMessageService.prepareOutgoing (drop)
                                │                       │ validate → connection + products lookup → text
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

## Inbox and public API

An agent can send the same message without a flow: from the inbox composer
(cart button, only where the channel's policy has `productMessages`) or through
`contacts.sendMessage` / `messages.create` with a `products` body
(`{ display, header?, body?, footer?, sections[{ title?, productIds[] }] }`, ids
from `products.listSendable`).

```
composer / public API ──► messageService.createOutgoing ──► productMessageService.prepareOutgoing
                                       │                          (validate → resolve → text)
                                       ▼
                 Message row (contentAttributes.product_message) ──► sendChannelMessage ──► channel `sendMessage`
```

- `prepareOutgoing` is the one entry for any sender that is not a flow step; the
  flow worker calls it too, with `onMissing: "drop"`. A caller that asked for
  exactly these products uses `"reject"`: a message that would go out without some
  of them is refused with `productsNotSendable` and the ids, never trimmed.
- Refusals are `422`. A message that breaks the channel's rules is `validation`;
  everything else is `productMessageUnresolvable` with `data.reason`
  (`channelUnsupported`, `catalogNotConnected`, `noProductsSendable`,
  `productsNotSendable`) so an agent can branch on it. No row is created.
- Not combinable with `text`, files, media, `flowId` or a comment reply (a valid
  `products` wins; one that fails its own schema falls through, as an invalid
  `flowId` already does). Outside the channel's customer-service window the row
  is created and the send fails like any text send; the composer hides itself.
- Deploy the worker and integrations before the builder: a product row delivered
  by an integration that predates the `sendMessage` branch would go out as text.

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
| Public API | `GET /v1/products/sendable` (`products.listSendable`, scope `ecommerce`); send with `products` on `contacts.sendMessage` / `messages.create` |
| Sending outside a flow | `packages/business/src/message/create-outgoing.ts` (`products` branch), `productMessageService.prepareOutgoing`, composer `features/messages/components/send-products-trigger.tsx` |

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
4. Render a stored `product_message` row in the integration's `sendMessage` (the
   inbox and public API send through it) and list `product_message` in its
   `handledOutgoingContentEntities`; the contract test fails a channel that
   declares `productMessages` without it.

## Inbound: carts and product questions

The other direction: a contact sends a shopping cart, or writes from a product's
page. Nothing in the shared layers is channel specific; an integration only
reports what happened and the rest is shared.

| Event | Trigger / webhook condition | WhatsApp signal |
|-------|-----------------------------|-----------------|
| Cart sent | `shoppingCartSent` (webhook `shopping_cart_sent`) | `messages[].type = "order"` |
| Product question | `userAskedAboutProduct` (webhook `user_asked_about_product`) | text message with `context.referred_product` ("Message business" button) |

```
integration parser ──► ReceivedMessageResult.commerce (raw ids only)
        │
        ▼
worker received-message ──► productMessageService.resolveInboundProducts
        │                        (retailer ids → workspace products, best effort)
        ├─► message saved with contentAttributes.inboundOrder / .referredProduct
        └─► emit shoppingCartSent / userAskedAboutProduct ──► triggers + webhooks
```

- **Contract.** An integration fills `commerce` (`IncomingCommerceEvent` in
  `packages/sdk/src/lib/shared/message.ts`): `cartSent` (catalog id, note, items with
  retailer id, quantity, price, currency) or `productInquiry` (catalog id + retailer id).
  It never resolves products: it cannot know the catalog `source`. A new channel (for example Messenger's `send_cart`) fills this
  field and maps the channel to a catalog source in `catalogSourceByChannel`
  (`packages/business/src/product-message/catalog-sources.ts`, plus a `resolveInbound`
  implementation if the source is new). Without that mapping nothing is stored or
  announced. A new kind is one entry in the handler map in
  `apps/worker/src/integration/handlers/inbound-commerce.ts`.
- **Resolution.** At most two indexed queries (the catalog connection, then the items) per delivered commerce message, run before it is saved and repeated on a redelivery
  (`productMessageService.resolveInboundProducts`, through the same
  `ProductCatalogSourceStrategy` as sending). It resolves by catalog id and retailer id
  inside the workspace; an inactive product still resolves, because the contact
  referred to it. Raw identity is authoritative and the lookup is best effort: a
  catalog this workspace never connected, an unknown id, or a failed lookup keep the
  reference with `product: null`, and the message is still saved and announced. A
  channel without a catalog source gets no references, so nothing is stored or announced.
- **Stored on the message.** `contentAttributes.inboundOrder` (`note`, `items[]`) and
  `contentAttributes.referredProduct`, beside whatever the channel already keeps: a
  WhatsApp order keeps its raw `order` fields at the top level, unchanged. Readers:
  `getInboundOrder` / `getReferredProduct`. The inbox shows a cart bubble (and a
  "Shopping cart (N items)" preview) or a product card below the contact's text; an
  unmatched item shows the channel's id.
- **When it fires.** Once per message, for a new or newly promoted message, in an
  active workspace, from a contact (never an echo): the same gate as postbacks. A
  redelivery is not new, a standby copy fires on its owner delivery, and a retry
  re-enters after the save and cannot announce twice. The event is read back from
  the saved message, so a promoted standby copy announces the snapshot it was saved with, never a
  fresh lookup that may differ.
- **Conditions.** Both conditions take an optional product (`sourceId`, a product id
  from `products.list`; omitted, `null` and `""` all mean "any product"). The event
  carries no `sourceId`, so the product filter runs in the condition evaluator: a cart
  matches when any resolved item is that product. The "is anyone listening" cache
  admits these two event types whenever any active condition of the type exists
  (`EVALUATOR_FILTERED_EVENT_TYPES`), including conditions pinned to a product.
- **Public API.** No new operation: `triggers.update` and `webhooks.create|update`
  accept the two conditions (and the five WhatsApp call conditions, which the schema
  previously rejected) through the shared condition schema, and messages expose the
  stored entities in `contentAttributes`.
- **Webhook payload** (snake_case, no internal ids): `channel`, `conversation_id`,
  `message_id`, `catalog_id`, then `note` and `products[{ product_id, retailer_id, name,
  quantity, item_price, currency }]` for a cart, or `product{ product_id, retailer_id,
  name }` for a question. An unmatched product has `product_id` and `name` of `null`.
- **Store events are separate.** The order and web shop cart events (new order, order
  accepted, shipped, concluded or cancelled, product ordered, product or category added
  to the cart, product removed from it, cart abandoned) come from the store itself, not
  from a channel — see `docs/ecommerce.md` "Trigger and webhook events". Meta documents
  WhatsApp carts as local to a device and describes no webhook for cart edits, so a
  WhatsApp catalog cart only ever fires `shoppingCartSent`.

## Known limitations

- Inbound: an unmatched cart item is never reconciled later; if the catalog lookup
  fails at receive time the stored reference stays unresolved.
- Inbound parsing is deliberately tolerant, which is our own policy and not something
  Meta documents: an order item missing its retailer id, quantity, price or currency is
  skipped, an order with no catalog id or no usable item reports no event (the raw order
  and its text are still stored), and a cart with some usable items is announced with
  those. Retailer ids are matched inside the connected catalog, and Meta's pages
  reviewed here do not state that they are unique per catalog.
- Flow-step sends are terminal on failure (no automatic retry): a transient Meta
  error drops that message and shows in Error Logs.
- Meta reports most WhatsApp API errors as `OAuthException`, which the shared
  error mapper classes as `AUTH_FAILED` ahead of the specific code, so an unknown
  product shows as an authentication error in the log. This is existing mapper
  behavior shared with template sends and has no side effect on the connection.
- A multi-product header/body or a section title that stops being
  allowed because products were dropped is omitted rather than failing the send.
