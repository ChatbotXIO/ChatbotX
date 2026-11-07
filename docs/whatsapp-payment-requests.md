# WhatsApp payment requests (Brazil)

Sending Meta's **payment request CTA templates**: a template button that lets a
buyer in Brazil copy a Pix code, copy a Boleto line, open a payment link, or
confirm a saved card with one click. ChatbotX does not create these templates
(they are made in WhatsApp Manager and synced like any other template); it
sends them, with the per-customer payment data filled in.

Sources: Meta's `payments-br` docs (`payment-request-cta`, `offsite-pix`,
`one-click-payments`), checked against open-source clients. Anything Meta does
not document is marked **unverified** below and is handled defensively.

## What the user provides, and what the server derives

| Value | Source |
|---|---|
| Button `sub_type`, `index`, payment method, label | Server, from the synced template |
| `currency` (`BRL`), `total_amount.offset` (`100`), minor-unit conversion | Server |
| Pix `flow_type` (`APPSWITCH` vs copy & paste) | Server, from the channel setting below |
| Pix code, Boleto digitable line, payment link URL, card last four / credential id, amount | The user — it is generated per customer by their payment provider. Every value accepts `{{variables}}`, so flows fill it from an earlier step |

WhatsApp neither expires nor reconciles payments; the payment provider owns both.

## Payment methods

The channel-agnostic model lives in `packages/flow-config/src/steps/payment-request.ts`
(`pix`, `boleto`, `payment_link`, `card_on_file`). One strategy table,
`paymentRequestMethodRules`, drives the flat API keys, validation, the form and
variable substitution. The WhatsApp binding is in
`wa-template-payment-request-rules.ts`.

| Method | Template button label (fixed by Meta) | `payment_setting.type` | Values |
|---|---|---|---|
| `pix` | Copy Pix code | `pix_dynamic_code` | `code`, optional `amount` |
| `boleto` | Copy Boleto code | `boleto` | `digitableLine` |
| `payment_link` | Open payment link | `payment_link` | `url` (any URL, or a variable) |
| `card_on_file` | Review payment | `offsite_card_pay` | `lastFourDigits`, `amount`, optional `credentialId` |

Amounts are written in major units (`12.34`) and converted exactly (string
arithmetic, positive, safe integer) to `total_amount { value: 1234, offset: 100 }`
with `currency: "BRL"`. Boleto and payment link never carry an amount.

### How the method of a template button is resolved

`resolveWaPaymentRequestMethod` never guesses:

1. A known `payment_setting.type` wins, and the documented label must be present
   and agree; otherwise the button is unsupported.
2. An unknown type is unsupported (it could be a method Meta adds later; it never
   falls back to the label).
3. No type at all: the fixed label decides.
4. A missing or unknown label is unsupported.

Whether Meta's template read returns `payment_setting` is **unverified**; the
chain above works either way. A template with an unsupported payment button
shows a warning in the template form, and sending it fails with a permanent
error.

## Public API, CLI and MCP

- **Flat parameters** (`templateParams`, e.g. `broadcasts.create`, the
  conversation template send): `button.{i}` is the main value (Pix code, Boleto
  line, link, card last four); `button.{i}.amount` and `button.{i}.credential_id`
  are the extras. Kinds: `pix_code`, `boleto_digitable_line`,
  `payment_link_url`, `payment_amount`, `card_last_four_digits`,
  `card_credential_id`. `templateParameters` describes them per template. The
  method is never sent: it comes from the template.
- **Nested `templateData`** stays the expert, backward-compatible form. There the
  caller's `sub_type`, `index` and `method` are untrusted: they are checked
  against the stored template and rejected on mismatch (never rewritten).
- **Channel setting**: `GET|PUT /v1/whatsapp-channels/{id}/payment-settings`
  (`whatsappChannels.getPaymentSettings` / `updatePaymentSettings`, scope
  `integrations`; CLI `whatsapp-channels payment-settings list|update`).

## Pix with redirect (`pixRedirectEnabled`)

A per-channel send policy (`IntegrationWhatsapp.pixRedirectEnabled`, default
off). On means Pix buttons are sent with `flow_type: "APPSWITCH"`; off omits it
(copy & paste). Meta requires onboarding before Pix with redirect works, so the
business turns it on only afterwards; buyers whose app cannot redirect still
get copy & paste from the same message. The converter reads
`ctx.integrationDetail.pixRedirectEnabled === true`, so there is no extra query.
The settings page has a switch (super admin only) next to the public endpoint.

## Send path and failure handling

1. Params are validated where they enter: flow publish, broadcast create/update,
   the public API (`validateWaTemplateSendParams`). A payment request must have
   its values filled and formatted correctly; `{{variables}}` are accepted.
2. Broadcast create/update also checks the payment data against the **stored
   template buttons** (`findPaymentRequestMismatches`, on the template rows
   already loaded for naming — no extra query): exactly one request per payment
   button, matching method, no extras.
3. The worker substitutes `{{variables}}` in every payment value, then runs
   `assertPaymentRequestsSendable` before any Graph call. It rejects a
   mismatch with the template, an empty or invalid value, and any
   `{{variable}}` that is still unresolved. The error is a permanent
   `PAYLOAD_INVALID` (never retried), `message:failed` is emitted with
   `willRetry: false`, and no payment data is put in the error text.
4. The Graph payload sends the button `index` as a string for `payment_request`
   only (Meta's examples); every other sub_type keeps its numeric index.

A conversation send (`POST /v1/conversations/{id}/whatsapp-template`) does not
load the template and only enqueues, so a bad nested `templateData` is accepted
(202) and surfaces as `message:failed` — the same as an unapproved template.

Limits: payment buttons are supported on top-level template buttons only
(Meta documents default templates; carousel cards are rejected). A template with
a payment request supports three buttons in total (enforced by Meta at template
approval).

## Inbound one-click confirmation

When the buyer confirms a one-click payment, Meta sends
`interactive.type = "payment_method"`. It is stored as
`contentAttributes { type: "whatsapp_payment_method", paymentMethod, lastFourDigits?, credentialId?, referenceId?, paymentTimestamp?, raw }`
and shown in the inbox as one localized line. The parser is lenient: the Orders
example is the only documented shape (`reference_id` is not claimed optional by
Meta), so everything but the discriminant is optional and the raw object is
always kept. A Meta retry of the same webhook is absorbed by the existing
source-message deduplication.

## Out of scope

- **Charging the card.** v1 records and displays the buyer's confirmation and
  exposes it through the messages API and realtime. Executing the charge and a
  trigger / outbound-webhook event carrying the credential are a follow-up: the
  generic `message:received` event does not carry `contentAttributes`, a new
  trigger needs a verified payload, and one-click payments are not yet publicly
  available from Meta.
- Showing sent WhatsApp templates in the inbox (no template renderer exists for
  any template today).
- FlowSpec `sendTemplate` parameters (it compiles `params: {}` for every
  template; raw node graphs remain the agent path).
- Creating payment templates in the builder.

## Live verification still needed (Brazil WABA)

Unverified without a Brazilian test number: the template read shape
(`payment_setting`), that Meta accepts the string index, Meta's error for Pix
with redirect or one-click on a business that is not enabled, and the real
one-click confirmation webhook payload.
