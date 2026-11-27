## Webhook Flow

1. External platform sends webhook to `/integrations/<channel>/webhook`
2. Builder route resolves integration config
3. `handleRequest` receives `{ config, req, queue }`
4. Handler enqueues job: `queue.add("incomingMessage", { type, data })`
5. Integration worker calls `allIntegrations[type].channels.channel.message.receiveMessage`

### White-label: register webhook URLs on the broker host

When white-label custom domains are in use, webhook URLs registered with the provider
(and any URL shown in a platform-credential settings card for the reseller to copy) must
use the **broker host** — `getBrokerOrigin()` / `buildBrokerCallbackUrl()`
(`apps/builder/src/lib/oauth-broker.ts`) — not the tenant's custom domain. Providers that
validate the registered host (e.g. WhatsApp/Meta, TikTok) cannot reach an unregistered
branded domain, so a webhook on the reseller domain silently fails. See
`features/integration-whatsapp/actions/webhook-url.ts` and `docs/tenancy.md`
(provider-console registration runbook).
