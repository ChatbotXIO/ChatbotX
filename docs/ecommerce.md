# Ecommerce: orders, vendors and store settings

The store side of ChatbotX after the catalog: orders, the vendors products are
sold by, and the per-workspace store settings. Products, categories, Meta
Catalog sync and product messages are covered in
[`product-messages.md`](./product-messages.md).

## Data model

| Table | What it holds |
|-------|---------------|
| `Vendor` | A seller or brand. Name unique per workspace, ignoring case (`Vendor_workspaceId_name_key` on `lower(name)`). `Product.vendorId` points here; deleting a vendor leaves its products without one. |
| `EcommerceSettings` | One row per workspace, written on the first save. Until then `ecommerceSettingsService.get` returns `ECOMMERCE_SETTINGS_DEFAULTS`. The row is always written whole, so its jsonb columns carry no database default. |
| `EcommerceOrderCounter` | The last order number per workspace. |
| `Order` | One order. Amounts are `numeric(19,4)` via `money()`. Contact, inbox and conversation links are `SET NULL` on delete. `rating`/`ratingComment` are set when the customer rates it (with the web shop). |
| `EcommerceOpenHours` | Named open-hours schedules; see below. |
| `OrderItem` | A line, **copied** from the product when the order was placed (name, variant, SKU, image, vendor name, prices). The order page reads these columns only, so editing or deleting a product never rewrites a placed order. |
| `OrderStatusHistory` | Every status an order went through, and who moved it (`user`, `apiToken`, `system`, `contact`). |
| `DiscountCode` | A discount code ("Coupons" in the UI), unique per workspace ignoring case (`DiscountCode_workspaceId_code_key` on `lower(code)`). Not the older `Coupon` pools (`/v1/coupons`), which take nothing off an order. `productIds` has no database default. |
| `DiscountCodeRedemption` | One use of a code: at most one per order (`DiscountCodeRedemption_orderId_key`). Removed, with `usedCount` given back, when the order is cancelled or deleted. |
| `EcommercePaymentProvider` | The store's own Stripe or PayPal account, one per provider per workspace. Stripe keeps only the connected account (`externalAccountId`, `acct_…`) and the platform Stripe credential it was connected through (`platformCredentialId`); one account belongs to one workspace per platform credential. PayPal keeps its Client ID, Secret and webhook id in `secret`, encrypted with AAD `ecommerce-payment:<workspaceId>:paypal`. |
| `OrderPayment` | One attempt to pay an order online — a Stripe Checkout Session or a PayPal order (`providerReference`, unique per provider). `status` `open` → `paid` / `expired` / `refunded`; `transactionId` (payment intent / capture id) is what a refund uses. Deleted with its order. |
| `Cart` | One web shop cart per contact (`Cart_workspaceId_contactId_key`): `items` (`productId`, `variantId`, `quantity`) as the customer left them, never prices. `lastActivityAt` is for the abandoned-cart reminder (later phase). `items` has no database default; every write sets it. `discountCode` is the code the customer typed. |

`Product.vendor` (free text) was replaced by `Product.vendorId`. The migration
created a `Vendor` per distinct name (case-insensitive) and linked the products
before dropping the column. The product API still accepts and returns `vendor`
as a name: a name not seen before creates the vendor
(`vendorService.resolveName`). Imports, templates and Meta Catalog import go
through the same resolution.

## Money and currency

- Amounts are in major units (`12.5` USD), the unit `Product.price`, WhatsApp
  carts and Meta Catalog already use.
- Every calculation goes through `@chatbotx.io/utils/money`
  (`computeLinePrice`, `percentOf`, `sumMoney`, `roundMoney`). Each part of a
  line is rounded once to the currency's own decimals (0 for VND/JPY, 3 for
  KWD), so totals are plain sums of rounded lines.
- A line is `gross = unitPrice × quantity`, then `Product.discount` %, then
  `Product.taxes` % on the discounted amount.
- An order adds the delivery cost (delivery orders only) and the service fee
  (`serviceFeePercent` of subtotal − discount).
- **The store currency wins.** An order placed from product ids is charged in
  `EcommerceSettings.currency`, using each product's price as is. The settings
  page warns how many products are priced in another currency. A WhatsApp cart
  keeps the currency and prices Meta sent.

## Order lifecycle

```
pending ──► accepted ──► shipped ──► concluded
   │            │            │
   └────────────┴────────────┴──► cancelled
                accepted ─────────► concluded
```

`ORDER_STATUS_TRANSITIONS` (`packages/database/src/partials/ecommerce.ts`) is
the only definition: the service, the public API and the buttons on the order
page all read it.

- A move is one guarded update (`UPDATE … WHERE status IN (allowed)`), so of
  two concurrent moves only one lands; the other gets
  `orderInvalidStatusTransition` (409).
- Completing a cash-on-delivery order marks it `paid`.
- An order paid online is accepted only once paid (`orderAwaitingPayment`),
  and cancelling it refunds the payment first — see "Online payments".
- Cancelling puts the stock back. Deleting an order that is not completed or
  cancelled puts its stock back too.
- Every move takes an optional `message`: it is kept on the order's history
  (as the reason, when cancelling) and rides along in the status message to
  the customer.
- Every side effect of a placed or moved order hangs off
  `orderService.afterStatusChange` (order triggers are added there later):
  - **Placed** (for an order paid online: once paid, `orderService.afterPaid`
    — `announcePlaced` runs then, after the `orderPaid` event): what
    `checkout.orderConfirmationMode` says — `default` the
    built-in confirmation (number, buyer details, address or "pickup in the
    store" + store address, date in the workspace timezone, cash on delivery,
    totals, items; spec image 34), `flow` the store's
    `orderConfirmationFlowId` run in the order's conversation instead
    (`sendFlow`, job id `order-confirmation-flow-<orderId>`), `none` nothing
    — and a `notifyNewOrder` push
    job (job id `new-order-<orderId>`, so a retried placement pushes once).
  - **Moved:** "The status of your order has been updated. Status: …" when
    the store turned on `notifyOnCartStatusChange`, always for a cancel or a
    completion, and whenever the member typed a message.
  - Customer texts (the confirmation, status notes, the WhatsApp cart
    summary and CHECK OUT, collection card buttons, the product search
    reply) are in the **workspace language** — every builder language is
    written in `order/customer-message-strings.ts`; anything else reads as
    English — whatever the contact's own locale, and go to the order's
    conversation. A send that fails (e.g. outside WhatsApp's 24-hour window)
    is logged; the order still stands.
- The `notifyNewOrder` push goes to the members who turned on **New order**
  in their notification settings (`WorkspaceMember.notificationTypes.newOrder`),
  titled "New order #N" in the workspace language with the customer and
  total. Email is not sent yet.

## Placing an order

`orderService.place` is the one creation path for orders built from product
ids (`source` `api`, `webshop`, `manual`). In one transaction it reads the
settings, loads the products (only this workspace's, only active ones), prices
the lines, checks the minimum order (not for `manual`), takes stock, allocates
the number and writes the order, its lines and the first history row. A
failure rolls back everything, including the number.

- **Variants.** A product with enabled variants needs a `variantId`; the line
  is priced at the variant's price.
- **Stock.** Products are locked with `SELECT … ORDER BY id FOR UPDATE`, so two
  orders sharing products cannot deadlock. A tracked product without enough
  stock refuses the order (`orderOutOfStock`) unless it allows out-of-stock
  purchase. Stock never goes below zero.
- **Order number.** `INSERT … ON CONFLICT DO UPDATE SET lastNumber = lastNumber + 1 RETURNING`
  on `EcommerceOrderCounter`, inside the order transaction. The row lock
  serializes numbering per workspace only; `Order_workspaceId_number_key` is
  the backstop.

## Online payments (Stripe, PayPal)

The store takes card payments through Stripe and PayPal payments, with its
**own** accounts: the money goes straight to the store. Connected in
**Settings → Integrations** (rows after Make), offered per store in the
payment settings (`payments.paymentMethods`: `cod`, `stripe`, `paypal`).
Provider calls live in `packages/payments` (`@chatbotx.io/payments`, no DB);
the rules in `packages/business/src/payment-provider` and `order-payment`.

### Connecting

- **Stripe — Stripe Connect OAuth.** The platform (or a reseller) saves its
  Stripe settings with a Connect client id (`ca_…`, Platform credentials →
  Stripe; only a super admin writes the platform-wide ones). Saving creates
  the platform's **Connect webhook** (`connect: true`) at
  `/api/payments/stripe/webhook/<platformCredentialId>`; the card shows the
  Redirect URI to add under Stripe → Connect → Onboarding options → OAuth
  (`/integrations/stripe/callback`, on the broker host or the reseller's own
  domain). A store's **Connect** opens `connect.stripe.com/oauth/authorize`
  (`scope=read_write`); its `state` is a random key kept 15 minutes in Redis
  and **taken once, atomically** by the callback, so the code is exchanged at
  most once (Stripe revokes the connection on a second use). The callback
  first relays to the host the connect started on, then requires the very
  member who pressed Connect (the state names them — a callback URL someone
  approved with their own Stripe account and passed on is refused), still a
  workspace super admin, exchanges the code with the platform secret key and
  keeps only `stripe_user_id` (the deprecated access token is not stored).
  Every later call uses the platform key with `Stripe-Account: acct_…`.
  `account.application.deauthorized` (the store disconnected from Stripe)
  removes the connection.
- **PayPal — Client ID and Secret** in a dialog. They are tried on live, then
  sandbox, so the store never says which; a webhook is created on the app
  (`/api/payments/paypal/<workspaceId>/webhook`, `WEBHOOK_URL_ALREADY_EXISTS`
  reuses it) and the keys are stored encrypted. Read back only as a masked
  Client ID.
- **Disconnecting** (best effort on the provider side) deletes the connection
  and drops the method from `paymentMethods` in one transaction (cash on
  delivery comes back if nothing is left). Disconnecting, or connecting
  another Stripe account / PayPal app, is refused (`paymentProviderInUse`)
  while open orders still need the account — waiting for their money, or paid
  and still open (cancelling them refunds through it): an attempt can only be
  read, closed or refunded through the account it was made on. The platform's
  Stripe settings likewise refuse a key of another Stripe account, or being
  removed, while stores are connected through them
  (`stripePlatformAccountInUse`). A late `account.application.deauthorized`
  (older than the connection) is ignored.
- **Connecting is UI only**, by a workspace super admin: it decides which
  account receives the store's money, which a workspace token must never do.
- Settings refuse an online method that is not connected
  (`paymentProviderNotConnected`) and PayPal in a currency it does not take
  (`paymentCurrencyUnsupported` — `PAYPAL_SUPPORTED_CURRENCIES`, not VND),
  checked whenever the payments group is saved.

### Paying

1. `orderService.place` with `paymentMethod` `stripe`/`paypal` (it must be
   offered and the order needs a contact) writes the order `pending` /
   `unpaid` with `paymentExpiresAt` = now + 30 minutes (`PAYMENT_EXPIRY_MINUTES`).
   Stock and the discount code are taken as for any order, but **nothing is
   announced**: no confirmation, push, `newOrder` / `productOrdered`, checkout
   flow or Pixel `Purchase` until the money comes in. An order that costs
   nothing is paid at once.
2. `orderPaymentService.startCheckout` (the web shop checkout, the order
   page's **Pay now**, `orders.getPaymentLink`) opens the provider's page
   under the order's row lock, or offers an open one again. One line for
   exactly the order total, in the provider's minor units: an amount that
   cannot be charged exactly (e.g. `12.345 USD`, `1.234 KWD`, decimals in
   HUF on PayPal) is refused, never rounded. Stripe Checkout takes cards only
   (wallets included) and lives at least 30 minutes; PayPal is an Orders v2
   `CAPTURE` order paid on its `payer-action` link. Idempotency keys:
   `order-payment-<id>`, `refund-<id>`; each PayPal capture try gets its own
   key (an order is captured once at most, and a declined try must not replay
   for the next funding source). The return URL is the
   customer's order page with a fresh shop token and `payment=return`.
   A page that cannot be opened at checkout cancels the order and puts its
   items back in the cart.
3. Money is settled by one path, `syncAttempt`, from the return page (so the
   order shows paid at once), the webhook job (`confirmOrderPayment`, job id
   per provider event) and the expiry scan. Under the order's lock, then the
   attempt's, the provider is **asked again** (the event itself is not
   trusted); PayPal is captured only while the order still waits for its
   money. Paid is checked to the smallest unit and currency: a match marks the
   order `paid` (`orderRepository.markPaid`, guarded `unpaid` and not
   cancelled) and runs `afterPaid`; money that does not match, or arrives for
   an order cancelled or already paid by another page, is **refunded** —
   never kept. A refund that fails throws and the job retries with the same
   key; the scan below catches whatever the retries left. Money for an order
   that was deleted is only logged: the order may have been delivered first.
4. `expireUnpaidOrders` (every minute, distributed lock) takes overdue orders:
   a payment that came in keeps the order; one still settling is looked at
   again in an hour; otherwise the order is cancelled (`reason:
   paymentExpired`, the customer is told) — the Stripe page closed first,
   PayPal simply never captured. A page found paid as the cancel closes it
   (the customer paid right at the deadline) stops the cancel
   (`LatePaymentArrivedError`): the order is read again and kept, marked
   paid, never refunded. A provider that does not answer, or a blocked owner,
   moves the deadline on so others are not held up. The same minute, open
   attempts 15 minutes past their page's end are read once more
   (`settleStaleAttempt`): closed ones are marked expired, money for an order
   no longer waiting for it is refunded. One that cannot be settled yet is
   only touched (`updatedAt`) and looked at again 15 minutes later —
   `expiresAt` always stays the page's real end, which is what
   `startCheckout` reads before offering a page again.

### Refunds and deletes

- Cancelling (member, API, expiry) runs `settlePaymentsForCancel` inside the
  order's transaction: first every open page is closed (one paid meanwhile
  joins the refunds; one still settling refuses the cancel), then each refund
  is made and **recorded at once outside the transaction**, so a later
  failure that rolls the cancel back never loses a refund already made. A
  failed refund refuses the cancel (`orderRefundFailed`); otherwise the order
  has `paymentStatus: refunded`, the `orderRefunded` event fires and the
  customer's status message says so.
- An online order whose money never came was never announced, so its cancel
  fires no event and sends nothing — except, when its time ran out, a line
  telling the customer why the order is gone.
- An open order paid online cannot be deleted (`orderPaidOnline`): cancel it.
- A purged workspace lets go of its payment providers first
  (`paymentProviderService.teardownForPurge`, passed to `purgeDueScheduled` by
  the worker's `purgeWorkspaces`, best effort): the Stripe account
  is deauthorized from the platform's Connect app and the PayPal webhook is
  deleted, before the rows go with the cascade.
- The expiry cancel stores `PAYMENT_EXPIRED_CANCEL_REASON` (English, for the
  API); the builder shows it translated (`orders.paymentExpiredCancelReason`).

## Discount codes ("Coupons")

The coupon form follows the spec (image 11): a code (or **Generate**),
"automatically apply to carts", a type, what it applies to, a minimum, usage
limits, the customers it is for, and active dates.

- **Types:** `percentage` (1–100), `fixedAmount` (store currency, never more
  than the lines it applies to), `freeShipping` (takes the delivery cost off
  a delivery order; no value, always the whole order).
- **Applies to:** the whole order, one category (its sub-categories count:
  a line matches on the product's `categoryId` or `subcategoryId`) or chosen
  products. A code that matches nothing in the order is
  `discountCodeNotApplicable`.
- **Minimum:** an amount or a number of items, read on the lines the code
  applies to, after the product and vendor discounts
  (`discountCodeMinimumNotMet`, with `minimum` and `missing`).
- **Order money:** the code comes off after the line discounts
  (`Order.couponDiscount`); the service fee is taken on what is left of the
  goods (a free-shipping code does not lower it); tax stays per line. The
  store minimum is read after every discount, the code included (the spec:
  "checked when all discounts are applied"); a free-shipping code does not
  count against it. `Order.discountCode` keeps the code
  as text, so deleting it never changes a placed order.
- **One code per order.** A typed code must be usable or the order is
  refused. Without one, the web shop applies the automatic code that takes
  off the most; an API order only gets the code it names.
- **Customers:** `specificCustomers` stores a contact filter
  (`customerFilter`, the same shape as the contacts list) checked with
  `contactService.matchesContactFilter` when the code is priced. Such a code,
  and a "one use per customer" code, never applies to an order without a
  contact.
- **Counting a use:** inside the order transaction the code row is locked
  (`SELECT … FOR UPDATE`) and every rule checked again, then
  `usedCount + 1` is a guarded update (`usageLimit IS NULL OR usedCount <
  usageLimit`) and the redemption is written. Two orders racing for the last
  use, or one customer's two orders on a once-per-customer code, are checked
  one after the other. The `DiscountCode_usedCount_check` constraint is the
  backstop.
- `orderService.quote` reports a typed code that cannot be used as
  `discountError` and prices the cart without it, so the cart page can say
  why; `place` throws.
- **Codes offered on the cart:** the web shop cart (and `webshop.getCart`'s
  `availableDiscounts`) lists up to 20 typed codes: not automatic, turned on
  and started, for everyone or for a customer filter
  (`discountCodeRepository.listOffered`; a code turned off is never
  listed). Each is priced against the cart by
  `discountCodeService.listAvailable` and carries a `status`:
  - `available` — the customer can tap it to apply it. The list starts with
    these, most taken off first (the cart marks the top one "Best choice"
    when there are two or more), then soonest to end.
  - `expired` (its end date passed), `usedUp` (no uses left, or this
    customer's once-per-customer use spent) or `notEligible` (a
    `specificCustomers` code whose filter this customer does not match —
    "Not eligible yet") — listed after, latest ended first, greyed out and
    refused. The query sorts usable codes first, so
    these never push a usable one past the 20.
  A code that does not fit this cart otherwise (minimum not met, nothing it
  applies to, free shipping on a pickup order) is left out. Every listed code
  — a `specificCustomers` one included — is visible to anyone with a shop
  link; only being turned off keeps a code off the cart.

All the pricing is in `packages/business/src/discount-code/pricing.ts`
(pure) and `discountCodeService.resolve`; `orderService.priceDraft` is the
only caller, for both the quote and the order.

## WhatsApp carts

A cart a customer sends through WhatsApp's own catalog does **not** become an
order by itself. It still fires `shoppingCartSent` as before
([`product-messages.md`](./product-messages.md)), and, when automation may
answer (`canAutomate`: not a standby copy, not an echo), queues
`replyToInboundCart` (job id `inbound-cart-reply-<messageId>`, so a redelivered
webhook answers once). The job (`withBlockedOwnerGuard`):

1. does nothing while the store takes no orders;
2. replaces the contact's `Cart` with the items linked to a product here
   (others are left out and counted);
3. answers with the summary (number of items, subtotal, delivery, other fees,
   total) and a **CHECK OUT** button opening the cart page — or the store's
   own page when `checkoutMode` is `externalLink`. It goes out as a synthetic
   `sendText` step through `ChatJobAction.sendFlowMessage` (`flowId: ""`), so
   the link is wrapped like any flow button's and `{{shop_token}}` is signed
   for this contact at send time. Nothing is sent when no item is sold here.

The customer checks out on the web shop, which creates the order through
`orderService.place`.

## Vendors

A vendor is a seller with its own rules, applied when an order is placed:

- `discountPercent` is taken off each of its products on top of the
  product's own discount (10% then 20% is 28% off);
- `minimumOrderValue` applies to the vendor's lines after discounts
  (`orderBelowVendorMinimum`);
- `isActive: false` refuses its products (`orderProductUnavailable`);
- `openHoursId` closes checkout outside its hours (see the web shop);
- `categoryId`/`subcategoryId`, phone, address and image are shown by the web
  shop. The vendors list has **Preview** and **Get Link** (below).

## Open hours

`EcommerceOpenHours` holds named schedules (`ranges`: day 0–6, `HH:mm`
from/to, workspace timezone). The store settings (`general.openHoursId`) and
each vendor pick one; null is "Always open". Deleting a schedule makes its
users always open (`SET NULL`). Checkout is refused outside the store's hours
or the hours of any vendor in the cart (`webshopClosed`,
`reason: outsideOpenHours`), in the workspace timezone; a range whose `to` is
earlier than `from` runs past midnight (`isWithinOpenHours`).

## Categories

Categories gained `imageUrl` and `isVisible` (and use the existing `rank`).
The categories page lists top-level categories with a Visible switch; a
category's "Subcategories" opens its children in the same table.

## Web shop

Public pages under `/shop/<workspaceId>` (listed in `PUBLIC_ROUTES`; the
platform's support bubble is hidden there). Every page needs `?token=`, a
signed shop token (`packages/encryption/src/shop-token.ts`, AES-GCM like the
appointment tokens, AAD `shop-token`):

- **customer** — `workspaceId`, `contactId`, `contactInboxId`, valid 7 days.
  A flow or bot button gets one with the system field `{{shop_token}}`,
  signed for whoever the message is sent to. The cart and orders belong to
  that contact, never to an id in the URL.
- **preview** — `workspaceId` only, valid 1 day: shows every page a customer
  sees — cart, discount codes, delivery choice, checkout form — but never
  orders: only **Place order** is off. With no contact, its cart lives in an
  httpOnly cookie (`features/webshop/lib/preview-cart.ts`, at most 30 lines,
  1 day), priced by the same `orderService.quote` for no contact
  (`webshopService.getPreviewCart` / `changePreviewCart`); nothing is saved
  in `Cart`, no cart event fires, and the Facebook Pixel does not load.

A token for another workspace, a forged or expired one, or an unresolved
`{{shop_token}}` shows "This link does not work".

| Page | What it does |
|------|--------------|
| `/shop/<ws>` | Products (`&q=`, `&category=`, `&vendor=`, `&products=<id>,<id>` (at most 20), `&page=`), drawn in the store's "Web shop product view" (6 views). Shows active products that are not add-on only, whose category/sub-category is visible and vendor active; search only finds searchable products. |
| `/shop/<ws>/products/<id>` | Images, variant options, quantity, the store's product buttons (Add to Cart / Share / Similar / Save). With checkout `productPage`, Buy opens the product's `productUrl` instead. |
| `/shop/<ws>/cart` | The cart priced by `orderService.quote` (same pricing as an order), items that cannot be ordered now (with their name), delivery or pickup (`&shipping=`), then the checkout form — or a link to `checkoutLink` with checkout `externalLink`. |
| `/shop/<ws>/orders/<id>` | The customer's own order (another contact's is not found), status, totals, and 1–5 stars + comment once concluded when `allowRateOrders` is on. |

Checkout (`webshopService.checkout`) checks, before `orderService.place`:
ordering on and open hours (store and vendors), the buyer fields the store
requires, an address and a country in `shippingCountries` for delivery. Only
the items that can be ordered now are placed — the ones the cart lists as
unavailable stay in it. In the order's transaction (`onPlaced`) the placed
quantities are taken out of the locked cart, so a refused order keeps it, an
item added in another tab meanwhile stays, and a double submit (the items
already gone) rolls back. An order keeps the channel the shop link was signed
for, not the contact's most recent one. With checkout `flow`, the chosen flow then runs in the customer's
conversation. The order page closes Messenger's in-app browser when it runs
there.

The page actions (`features/webshop/actions/webshop.action.ts`) take the
token, change a preview's cookie cart instead of a contact's (placing or
rating an order from a preview is refused, `webshopPreviewOnly`), are rate
limited per contact
(`checkGuestRateLimit`), and return refusals as codes the page translates
rather than the server's English message. A Facebook Pixel id loads the Pixel
and reports `ViewContent`, `AddToCart`, `InitiateCheckout` and `Purchase`.

Every shop page is in the **workspace language** (`Workspace.language`), not
the viewer's `NEXT_LOCALE` cookie, so a customer who never opened the builder
reads the merchant's language: server strings go through
`getShopTranslations(shop)` and `ShopLayout` wraps the client parts in their
own `NextIntlClientProvider`. Only the invalid-link page, which has no
verified workspace, falls back to the viewer's language.

**Shop link (how a merchant gets the URL for a flow).** Like a Mini App's
Public URL, a bar pinned to the bottom of every Ecommerce page (it stays in
view while the page scrolls) shows the whole shop's link — `https://<app>/shop/<workspaceId>?token={{shop_token}}` — with
Copy and Preview. Pasted into a button of a flow, broadcast or sequence, the
`{{shop_token}}` is signed for each contact who receives it, so they order as
themselves. A product's edit page pins its own Public URL (its
`/products/<id>` page) to the bottom, beside Save. **Preview / Get Link** in the row menu of a product, vendor or
category do the same for that page: Preview opens a preview link (browses,
never orders); Get Link copies the URL with `?token={{shop_token}}` — a
product opens `/products/<id>`, a vendor or category adds `&vendor=` /
`&category=`. `webshop.getLink` returns both (`productId`, `vendorId`,
`categoryId`).

## Trigger and webhook events

The store events reach both triggers and outbound webhooks. Unlike the
channel events, they reach webhooks whatever started them (a web shop order,
a member accepting it in the app, an API call) — `COMMERCE_EVENT_TYPES` in
`packages/events/src/event-type-registry.ts`.

| Event | Fired by | Condition |
|-------|----------|-----------|
| `newOrder`, `orderAccepted`, `orderShipped`, `orderConcluded`, `orderCancelled` | `orderService.afterStatusChange`, once per status (`newOrder` of an online order once paid) | none |
| `orderPaid`, `orderRefunded` | `orderService.afterPaid`; a cancel that refunded the payment | none |
| `productOrdered` | the same, once when the order is placed | optional product (any of the order's) |
| `productAddedToCart`, `productRemovedFromCart` | a web shop cart change (`webshopService`) | optional product |
| `categoryAddedToCart` | with `productAddedToCart`, for a product with a category | optional category; its sub-categories count |
| `cartAbandoned` | the abandoned-cart scan | none |

Only an order or cart tied to a contact fires them. The product and category
filters are applied by the evaluator (`EVALUATOR_FILTERED_EVENT_TYPES`); the
webhook payloads (`new_order`, `product_added_to_cart`, `cart_abandoned`, …)
carry snake_case fields and never `contactInboxId`.

## Abandoned carts

`EcommerceSettings.abandonedCartDelayMinutes` (null is off) and
`abandonedCartFlowId`. Every minute `scanAbandonedCarts` (schedule queue,
distributed lock) claims carts with items, idle longer than their store's
delay and not reminded since the customer last changed them
(`cartRepository.claimAbandoned`: `UPDATE … WHERE abandonedNotifiedAt IS NULL`
over a `FOR UPDATE SKIP LOCKED` batch, partial index
`Cart_abandoned_scan_idx`), so a cart is reminded once; a customer change
clears `abandonedNotifiedAt` again. For each cart, under
`withBlockedOwnerGuard`, `webshopService.remindAbandonedCart` emits
`cartAbandoned` and runs the store's flow in the customer's conversation on
the channel the cart came from (`sendFlow`, one job per abandonment). A cart
whose items can no longer be ordered is skipped; a contact without a
conversation gets only the event.

## Product collections (Messenger)

The flow step `sendCollection` (spec images 28–29): `automated` sends the
products matching name / category / sub-category / vendor when the step is
sent, `manual` the chosen ones, at most 10, only what the web shop shows. The
worker turns it into product cards *before* the contact-variable pass
(`resolveCollectionStep` in `packages/business/src/webshop/collection.ts`), so
the `{{shop_token}}` in each card's link is signed for that contact; Messenger
sends them as a generic-template carousel. Card: image, name, price after the
product's discount and vendor, and buttons per "Buttons in Products" — View
(or Buy, opening `productUrl`, with the "visit the external product page"
checkout) and Similar (the product's category). A collection matching nothing
is skipped, not sent empty. Flow import remaps a manual collection's
`productIds`; an automated one's category and vendor ids are not remapped.

## Search Products by message

With `general.searchProducts` on, a contact's message naming products is
answered with them, after Keywords and before the global router, AI agent and
default reply (`processAutomatedResponse`). Matching
(`packages/business/src/webshop/product-search.ts`) compares whole words,
ignoring case, accents and `đ`, against the names of searchable products the
shop shows (the first 2,000, cached 60 seconds): a message naming a product,
or a message that is part of a product's name; 3 characters at least, 10
products at most, the exact name first. Messenger gets a product collection;
other channels the names and a button opening the products found — the
product's page for one, the shop listing them (`?products=`) for more, never a
search for the whole message. A failed search falls through to the usual reply.

## Sales analytics

The Analytics tab and `ecommerceAnalytics.get` (spec image 27):
`ecommerceAnalyticsService.getDashboard` over `orderAnalyticsRepository`.
Cancelled orders and orders in another currency than the store's never count.
Days are the workspace timezone's; a one-day range is charted by hour, longer
by day, every bucket present. Each figure carries the change against the
period of the same length just before (null when that period had none);
Lifetime's change is what the period added to the sales before it. Top
products and vendors are the 10 best by line totals, named as ordered.

## Contact filters on purchases

`totalSpent`, `numberOfOrders` (a contact who never bought is 0), `bought`
(the latest order's date), `boughtItems` (a product of an order), and on the
web shop cart `shoppingCartIsEmpty`, `shoppingCartContainsItems`,
`shoppingCartSubtotal` / `shoppingCartTotal` (at today's prices, before /
after the products' own discounts). Orders count when not cancelled and in the
store currency. SQL in `packages/database/src/queries/contact-filter/commerce.ts`;
negations (`ne`) also match contacts without orders or a cart. The filters
work everywhere the contact filter does: contacts, broadcasts, conversations
and the discount codes' "Customer eligibility".

## Store settings

Grouped as the settings page shows them (`general`, `payments`, `shipping`,
`checkout`); the API takes a partial update per group. The service checks:

- `checkoutMode: externalLink` needs `checkoutLink`;
- `checkoutMode: flow` needs a `checkoutFlowId` of this workspace;
- `orderConfirmationMode: flow` needs an `orderConfirmationFlowId` of this
  workspace;
- `shippingType` is `none`, `delivery`, `pickup` or `deliveryAndPickup`;
  offering pickup needs `storeAddress`. An order's own `shippingType` must be
  one the store offers (`orderShippingTypeUnavailable`);
- `defaultShippingCountry` must be in `shippingCountries` when that list is set.

Settings marked "Pro" in the product spec (open hours, product search,
Facebook Pixel, abandoned-cart message) go through
`ecommerceSettingsService.resolveProFeatures`. It allows every plan for now;
that method is the one place a plan check goes.

## Public API (scope `ecommerce`)

| Operation | Route |
|-----------|-------|
| `orders.list` / `get` / `create` / `delete` | `GET /v1/orders`, `GET`/`DELETE /v1/orders/{id}`, `POST /v1/orders` (optional `discountCode`, `paymentMethod`) |
| `orders.accept` / `ship` / `conclude` / `cancel` | `POST /v1/orders/{id}/<verb>` (optional `message`); cancel refunds an online payment |
| `orders.getPaymentLink` | `POST /v1/orders/{id}/payment-link`: the Stripe/PayPal page to pay a pending online order (`url`, `expiresAt`) |
| `paymentProviders.list` / `getConnectLink` / `disconnect` | `GET /v1/payment-providers`, `GET /v1/payment-providers/{provider}/connect-link` (the Settings → Integrations page a super admin connects on — connecting is never done with a workspace token, since it decides which account receives the money), `DELETE /v1/payment-providers/{provider}` |
| `openHours.list` / `create` / `update` / `delete` | `/v1/open-hours[/{id}]` (`update` is `PATCH`) |
| `products.list` / `listSendable` / `get` / `create` / `update` / `delete` | `/v1/products[/{id}]` (`update` is `PUT`), `GET /v1/products/sendable` |
| `products.setActive` / `deleteMany` | `PATCH /v1/products/{id}/active`, `POST /v1/products/bulk-delete` |
| `products.getImportTemplate` / `createImportUpload` / `peekImportHeaders` / `startImport` / `listImports` / `getImport` | `/v1/products/import-template`, `/v1/products/imports[/{id}]`, `/v1/products/imports/upload-url`, `/v1/products/imports/files/{fileId}/headers` |
| `products.getMetaCatalog` / `listMetaCatalogBusinesses` / `createMetaCatalog` / `selectMetaCatalog` / `syncMetaCatalog` / `searchMetaCatalogItems` / `disconnectMetaCatalog` | `/v1/products/meta-catalog[/businesses\|/select\|/sync\|/items]` |
| `productCategories.list` / `create` / `update` / `delete` | `/v1/product-categories[/{id}]` (`list` takes `parentId`, `name`; `update` is `PUT`) |
| `productCategories.setVisible` | `PATCH /v1/product-categories/{id}/visible` |
| `productVendors.list` / `create` / `update` / `delete` | `/v1/product-vendors[/{id}]` (`list` takes `name`, `page`, `perPage`, all vendors when omitted; `update` is `PATCH`) |
| `ecommerceSettings.get` / `update` | `GET` / `PATCH /v1/ecommerce/settings` |
| `webshop.getLink` | `GET /v1/webshop/link` (`contact`, `page=cart`, `productId`, `vendorId`, `categoryId`): `url` signed for the contact (a preview without one) and `buttonUrl` with `{{shop_token}}` for bot buttons |
| `ecommerceAnalytics.get` | `GET /v1/ecommerce/analytics` (`from`, `to`, days of the workspace timezone; today by default) |
| `discountCodes.list` / `get` / `create` / `update` / `delete` | `/v1/discount-codes[/{id}]` (`update` is `PATCH`) |
| `discountCodes.setActive` | `PATCH /v1/discount-codes/{id}/active` |
| `discountCodes.generateCode` | `GET /v1/discount-codes/generate-code`: a free random code |
| `discountCodes.validate` | `POST /v1/discount-codes/validate` (`code`, `items`, `contact`, `shippingType`): what the code takes off now, or why not; uses nothing up |
| `carts.get` | `GET /v1/carts/{identifier}` (contact as `id:` / `email:` / `phone:`): the cart priced like an order now |

The builder's server actions call the same service methods. The web shop's
own page actions (cart, checkout, rating) are end-customer actions signed by
the shop token, exempt from the public API rule; agents read the result
through `carts.get` and `orders.*`.

Known limits: a PayPal capture left `PENDING` (e.g. the store must accept
the currency by hand) keeps its order waiting and refuses a cancel until
PayPal settles it; a Stripe refund that fails later (`refund.failed`) is not
followed; sandbox PayPal keys and Stripe test connections take test money —
the settings and the order page mark them, nothing else stops them.

## Not built yet

Delivery cost per location, email to members on a new order, and product
add-ons in the web shop.
