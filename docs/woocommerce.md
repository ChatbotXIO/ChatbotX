# WooCommerce store source

A workspace's ecommerce can mirror a WooCommerce store instead of managing its
own catalog, the same way it mirrors Shopify (`docs/shopify.md`). Products,
variations, stock, coupons and orders come from WooCommerce; the web shop
(`/shop/{workspaceId}`), carts, triggers, analytics and the public API keep
working on the mirrored rows.

The store-source rules are shared with Shopify and described in
`docs/shopify.md` → "Store source": `EcommerceSettings.storeSource` is
`woocommerce`, every catalog row carries `source: woocommerce` and the store's
own id as `externalId`, lists show only the current source, and mirrored rows
are read-only here (`externalStoreManaged`, 409, `data.store: woocommerce`).

## Connecting

`wooCommerceIntegrationService.connect`
(`packages/business/src/woocommerce/integration.service.ts`), behind
`woocommerce.connect` and the Settings → WooCommerce form, takes:

| Field | Where it comes from |
|---|---|
| `siteUrl` | The WordPress site's address. `https://` only (the keys travel with every call); a WordPress in a sub-folder keeps its path. |
| `consumerKey` / `consumerSecret` | WooCommerce → Settings → Advanced → REST API → Add key, permission **Read/Write** (write is for placing orders and registering webhooks). |

Connect:

1. Normalizes the address (`woocommerceSiteUrlSchema`) and refuses one that
   resolves to a private or local address (`checkSsrfSafety`) — the keys and
   every later call go there from our servers.
2. Reads `/wp-json/wc/v3/data/currencies/current` with HTTP Basic auth. A host
   that strips the `Authorization` header answers 401; the keys are then tried
   in the query string, and the mode that worked is saved (`authMode`). Redirects
   are not followed: a redirect means the address is not the store's
   canonical one, and the error names the address to use.
3. Generates a webhook secret and registers
   `/api/woocommerce/{workspaceId}/webhook` for every topic in
   `WOOCOMMERCE_WEBHOOK_TOPICS` (`product.*`, `order.*`, `coupon.*`).
4. Saves `IntegrationWoocommerce` (one per workspace) with the keys and the
   webhook secret encrypted (`woocommerce:{workspaceId}` as AAD), then removes
   our older webhooks on the store (and those of a previous site), and queues
   a full sync. A connect failing before the save removes only the webhooks it
   created: the working connection keeps its own.

The address is checked for a public IP again before every use of the keys
(`resolveWooCommerceCredentials`), so a domain later pointed at a private
address gets no request.

Permalinks must not be set to Plain: the REST API lives under `/wp-json/`.

Disconnect and workspace removal delete our webhooks best effort
(`disconnectWorkspaceIntegrations` lists `woocommerce`). Disconnecting switches
a store selling from WooCommerce back to `chatbotx`.

## Currency

A store selling from WooCommerce shows prices and charges orders in the
WooCommerce store's currency. Everything (web shop, carts, orders, messages,
analytics) reads `payments.currency`, so that setting follows the store
(`adoptExternalStoreCurrency`, `packages/business/src/ecommerce-settings/store-source.ts`):

- switching `storeSource` to `woocommerce` takes the connected store's
  currency code at once, then reads the store's symbol (`&#8363;` → `₫`) and
  its position (`woocommerce_currency_pos`: `left`, `right`, `left_space`,
  `right_space`) from WooCommerce;
- every sync reads them again, so a currency changed in WooCommerce follows
  after Sync Now.

The Payments section is hidden while the store sells from WooCommerce; going
back to our own catalog keeps the last currency.

## Sync

The integration queue carries `woocommerceSync` and `woocommerceWebhook`
(`apps/worker/src/integration/handlers/woocommerce/`), both under
`withBlockedOwnerGuard`.

- `woocommerceSync` — `wooCommerceSyncService.run`: products (variable
  products with their variations), coupons, then orders created in the last
  60 days. Only one runs at a time (`syncStatus` is claimed before queueing;
  one older than 30 minutes is treated as dead). A 401 marks the connection
  `invalid`. Requesting a sync also turns back on any of our webhooks
  WooCommerce disabled.
- `woocommerceWebhook` — one job per distinct delivery. WooCommerce's
  `X-WC-Webhook-Delivery-ID` is a hash of the webhook and the current second,
  so two changes in the same second share it: the job id hashes it with the
  body, so those stay two jobs and only a repeated identical body is one. The
  route answers WooCommerce's creation ping (`webhook_id=…`, no topic) with
  200, checks `X-WC-Webhook-Signature` (base64 HMAC-SHA256 of the body, Web
  Crypto) and `X-WC-Webhook-Source`, then the job reads the product, order or
  coupon back from the store by id, so late or reordered deliveries still
  write the current state.

WooCommerce does not send a product webhook when an order takes or returns
stock, so after every order webhook the products on the order are read again.

## Mapping

`packages/business/src/woocommerce/mappers.ts`:

| WooCommerce | Ours |
|---|---|
| `publish`, visible in the catalog | `status: active` |
| `publish` with catalog visibility `hidden`, or `private` | `unlisted` |
| `draft`, `pending`, `future` | `draft` |
| `simple` product | No variants; ordered by its own id (`externalVariantId`) |
| `variable` product | Variation attributes → options, each variation → a variant (`externalId` = variation id). A private variation is a disabled variant. |
| A variation with an "Any …" attribute | One variant per value, `externalId` `{variationId}~{attribute}={value}` (e.g. `55~Size=M`, keyed by the values so adding one later moves nothing). They order that variation with the picked values as line meta (`Size: M`); an order line comes back to the variant whose values its meta shows. |
| `grouped`, `external` products | Not mirrored (they cannot be put in a cart) |
| First category other than "Uncategorized" | Category |
| First brand (WooCommerce 9.6+) | Vendor |
| Stock managed | `inventoryQuantity`; not managed → not counted, unless out of stock (0) |
| HTML descriptions | Plain text |

Coupons our cart can price become `DiscountCode` rows: `percent`,
`fixed_cart`, free shipping only, on the whole cart or on listed products,
with a minimum spend, usage limit and expiry. Coupons with per-product fixed
amounts, category or email limits, exclusions, sale-item rules or a maximum
spend are left out; they still work when typed on WooCommerce's own checkout.

## Orders

Orders are written with `orderService.syncExternal` (`source: woocommerce`,
`externalId` = the site and the order id, e.g. `example.com#1234`, since
WooCommerce numbers orders per site; `externalName` = `#{number}`). Statuses only move
forward (`nextMirroredStatus`).

| WooCommerce | `status` | `paymentStatus` | `fulfillmentStatus` |
|---|---|---|---|
| `pending`, `on-hold` | `pending` | `unpaid` | `unfulfilled` |
| `processing` | `accepted` | `paid` when `date_paid` is set, else `unpaid` (cash on delivery) | `unfulfilled` |
| `completed` | `concluded` | `paid` | `fulfilled` |
| `refunded` | `accepted` (a concluded order stays concluded) | `refunded` | — |
| `cancelled`, `failed` | `cancelled` | — | — |
| `checkout-draft`, `trash` | not mirrored | | |

WooCommerce has no "shipped" status of its own: the `Shipped` trigger never
fires for a WooCommerce order. Tracking is read from the Shipment Tracking
extension's `_wc_shipment_tracking_items` order meta when the store uses it.

Who announces (messages and Ecommerce trigger events) follows Shopify: order
webhooks only while `storeSource` is `woocommerce`, the In-App checkout
always, the full sync never.

The contact comes from the `cbx_ref` order meta (the signed shop token our
checkout stamps), or else a contact with exactly the billing email
(lowercased) or phone (E.164 in the billing country).

## Checkout

`webshopService.checkout` → `checkoutOnExternalStore` picks the WooCommerce
adapter (`packages/business/src/woocommerce/checkout.ts`) and branches on
`checkout.externalCheckoutMethod`:

- `webCheckout` — creates a `pending` order on WooCommerce (lines, customer,
  delivery fee `shipping.deliveryCost`, coupon, `cbx_ref` and
  `cbx_checkout=web` meta) and returns its payment page (`payment_url`, or
  `/checkout/order-pay/{id}/?pay_for_order=true&key=…`) as `paymentUrl`. The
  customer pays with the store's own payment methods. Such an order is **not
  mirrored while it is still pending, failed or cancelled**: it appears here
  (and is announced) once it is paid or otherwise moves on, and only then
  leaves the cart — an abandoned payment page tells nobody anything.
  WooCommerce cancels unpaid orders itself after its "Hold stock" time.
- `inApp` — creates a `processing` cash-on-delivery order (WooCommerce takes
  the stock), mirrors it at once and takes the lines out of the cart.

WooCommerce prices the lines and the coupon itself; a coupon it refuses fails
the checkout with `woocommerceOrderRejected`.

## Public API

`woocommerce.getStatus`, `woocommerce.connect`, `woocommerce.sync`,
`woocommerce.disconnect` (scope `ecommerce`); `ecommerceSettings.update` for
`general.storeSource: "woocommerce"` and the shared `checkout.externalCheckoutMethod`
and `checkout.externalAutoApplyDiscounts`.

## Limits

- Connecting a different WooCommerce site keeps the old site's orders apart
  (their `externalId` names the site). Products and coupons with the same id
  are taken over by the new site's on the next sync; the rest are removed.
- `product.deleted` for a variation reads its variable product again rather
  than deleting anything.

## Troubleshooting

- **"did not answer as a WooCommerce REST API"** — the address is wrong, or
  WordPress permalinks are set to Plain.
- **"redirected to …"** — connect with the address the store redirected to
  (often `www.` or the `https://` canonical domain).
- **Connection `invalid`** — the REST API key was revoked or its user lost
  access; create a new key and connect again.
- **Sync `failed` with a 403** — the key is Read only; give it Read/Write.
- **Changes stop arriving** — WooCommerce disabled our webhooks after failed
  deliveries (WooCommerce → Settings → Advanced → Webhooks shows them
  "Disabled"); press Sync Now to turn them back on and catch up.
- **Orders arrive without a contact** — the customer bought on the storefront
  directly and no contact has their email or phone.
