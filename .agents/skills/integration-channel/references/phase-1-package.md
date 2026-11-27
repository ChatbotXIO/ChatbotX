### Phase 1: Integration Package (create `integrations/<channel>/`)

**Copy `integrations/telegram/`** — a live, minimal `customAuthSchema` integration. Copying a
sibling keeps dependency versions and the `exports`/`scripts` blocks correct; a hand-written
template drifts on every bump.

```bash
cp -r integrations/telegram integrations/<channel>
```

Then rename throughout and strip Telegram-specific logic. The five files that matter:

| File | What to change |
|---|---|
| `package.json` | `name` → `@chatbotx.io/integration-<channel>`. Keep the `exports` and `scripts` blocks as-is. Drop deps the new channel doesn't use. |
| `tsconfig.json` | Nothing — it just extends `@chatbotx.io/typescript-config/base.json`. |
| `src/index.ts` | Nothing — re-exports `./integration`. |
| `src/schema.ts` | `<channel>AuthSchema` — extend `customAuthSchema` (SDK) with the auth fields from the confirmation step, or use `Oauth2AuthValue` for OAuth channels. Export `<Channel>Config`, `<Channel>AuthValue`, `<Channel>Actions`. |
| `src/integration.ts` | `name: "<channel>"`, the `channels`/`actions` maps, and the `handleRequest` switch that routes the URL's last path segment (`case "webhook"`) to your handler. Implement `disconnect` if the platform supports it. |
| `src/handlers/webhook.ts` | Parse the platform's payload and `props.queue?.add("incomingMessage", { type: "incomingMessage", data: { integrationType: "<channel>", integrationIdentifier, payload } })`. |

The `Integration` class and `customAuthSchema` come from `@chatbotx.io/sdk`
(`packages/sdk/src/lib/integration.ts`, `packages/sdk/src/lib/auth/index.ts`).
