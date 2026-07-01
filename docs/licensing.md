# Enterprise licensing

How the **enterprise** edition of ChatbotX is unlocked and verified.

- **Model:** offline, GitLab-EE style. The license is a signed token verified
  fully offline against a public key baked into the app — **no phone-home, no
  API call**, works air-gapped.
- **Audience:** operators self-hosting the enterprise edition.
- **License creation (signing) lives in the private `../aha.chat-enterprise`
  repo** and is never shipped here.
- **Core module:** `packages/business/src/enterprise/license/`.

## Why a signed license

The only edition signal is `NEXT_PUBLIC_EDITION` (`community | enterprise |
cloud`) — a client-exposed env var with no verification. Anyone could set
`NEXT_PUBLIC_EDITION=enterprise` and unlock enterprise features for free.

The enterprise edition is installed on customer-owned, often near-air-gapped
servers, so the gate must verify **fully offline** and be **tamper-proof** in an
open-source (AGPL) codebase. The answer is an **Ed25519-signed JWS token**:

- The **vendor** signs a payload (features, limits, customer, expiry) with a
  private key held only in `../aha.chat-enterprise`.
- The **app** ships the matching **public key in source** and verifies the token
  offline with [`jose`](https://github.com/panva/jose). A public key can only
  *verify* — it can never sign or forge a license — so committing it is safe.
- **Upgrades need no redeploy** — the vendor re-issues a token with a new
  payload; the customer swaps `LICENSE_KEY` and restarts.

This mirrors GitLab EE: the public key is in the open-source code, verification
is entirely offline, and the private signing key stays in internal systems.

## The model: edition sets the ceiling, license unlocks within it

| Edition      | Entitled?                                                             |
| ------------ | -------------------------------------------------------------------- |
| `cloud`      | Always (billing-driven; license ignored).                            |
| `community`  | Never.                                                               |
| `enterprise` | **Only with a valid, non-expired, signature-verified license.** Individual features additionally require their flag in the token's `features[]`. |

The server-side seam is `packages/business/src/user/entitlements.ts`:

```ts
export const hasEnterpriseFeatures = async (): Promise<boolean> => {
  if (isCloud()) return true
  if (!isEnterprise()) return false
  return (await getLicenseStatus()).state === "valid"
}
```

On a missing, invalid, or expired key the app **degrades to the community
feature set** — it never crashes and never destroys data.

> The client-side `hasEnterpriseFeatures` in `apps/builder/src/env.ts` is an
> **edition-only, cosmetic** check (it hides sidebar items). It is *not* a
> security boundary — a client can neither read `LICENSE_KEY` nor run the crypto
> check. Real enforcement is always the server-side seam above.

## The customer sets only LICENSE_KEY

| Env var (server-only) | Holds                                                    |
| --------------------- | -------------------------------------------------------- |
| `LICENSE_KEY`         | The signed compact JWS token issued by the vendor.       |

The public verification key is **baked into the source**
(`packages/business/src/enterprise/license/public-keys.ts`) — the customer does
**not** provide it. `LICENSE_KEY` is declared in `packages/business/src/keys.ts`
and `apps/builder/src/env.ts`, is not prefixed `NEXT_PUBLIC_`, and never reaches
the client.

`LICENSE_PUBLIC_KEYS` is a `Record<kid, PEM>` so multiple public keys can coexist
for **key rotation** — each license's JWS header carries a `kid` that selects
which public key verifies it. Old licenses keep working under their original
`kid` while new ones are signed with a fresh key.

## Token shape

Compact JWS, header `{ alg: "EdDSA", kid, typ: "JWT" }`. Payload
(`packages/business/src/enterprise/license/schema.ts`):

| Claim          | Meaning                                                          |
| -------------- | -------------------------------------------------------------- |
| `sub`          | Customer id (JWT subject).                                       |
| `iss`          | Must equal `https://chatbotx.io/licenses` (`LICENSE_ISSUER`).    |
| `iat` / `exp`  | Issued-at / expiry (unix seconds). Required.                     |
| `nbf`          | Optional not-before.                                             |
| `customerName` | Human-readable customer name.                                    |
| `licenseId`    | Vendor's internal license id.                                    |
| `tier`         | `"enterprise"` or `"enterprise-plus"`.                           |
| `features`     | Subset of `sso`, `customBranding`, `customDomain`, `auditLog`, `prioritySupport`. |
| `limits`       | `maxWorkspaces`, `maxSeats`, `maxChannels` — positive int or `null` (unlimited). |

Verification (`service.ts`) rejects non-`EdDSA` algorithms *before* verifying
(algorithm-confusion guard), rejects unknown `kid`s, enforces `iss`/`exp`/`nbf`
via `jose`, and validates the payload shape with zod. An **expired** token still
surfaces its claims (state `"expired"`) so operators can see what lapsed.

> `LICENSE_ISSUER` in `public-keys.ts` must exactly match the `iss` claim set by
> the signer in `../aha.chat-enterprise`, or every token fails verification.

## Verifying is memoized per boot

`loadLicense()` reads `LICENSE_KEY` **once** and memoizes the resulting
`Promise<LicenseStatus>` at module scope. A restart re-reads env — this is why
swapping `LICENSE_KEY` requires a restart, not just a reload.

Accessors:

- `getLicenseStatus()` / `getLicense()` — the full `LicenseStatus`.
- `hasFeature(flag)` — `true` only when the license is valid **and** lists the
  flag.
- `getLimit(key)` — the numeric limit (`null` = unlimited) when valid.

## Issuing a license (vendor)

License **creation** — keypair generation and token signing — lives in the
private `../aha.chat-enterprise` repo and is intentionally **not** part of this
(community) codebase. That repo holds the private signing key and produces the
compact token the customer pastes into `LICENSE_KEY`.

When the private repo generates its keypair, its **public** key must be added to
`LICENSE_PUBLIC_KEYS` in `packages/business/src/enterprise/license/public-keys.ts`
(replacing the placeholder), and its signer's `iss` must equal `LICENSE_ISSUER`.

## Installing a license (customer)

Set two env vars and restart — no redeploy:

```dotenv
NEXT_PUBLIC_EDITION=enterprise
LICENSE_KEY=eyJhbGciOiJFZERTQS1...
```

## Enforcing features and limits

The edition+license gate (`hasEnterpriseFeatures()`) is live — e.g. the
`/admin/(enterprise)` route group and platform `customCSS`/`customJS` in
`packages/business/src/platform/settings.ts` are already behind it.

To gate an individual capability, add a server-side check at the read/creation
point (all DB access stays in services — never in `apps/`):

```ts
import { hasFeature, getLimit } from "@chatbotx.io/business"

if (!(await hasFeature("customDomain"))) {
  // omit / block the feature
}

const max = await getLimit("maxWorkspaces") // null = unlimited
if (max !== null && currentCount >= max) {
  throw /* the standard domain error from packages/business/src/errors.ts */
}
```

## Accepted tradeoffs

- **Clock trust.** Offline `exp` relies on the server clock; a customer could
  roll it back. Acceptable for an explicitly offline/air-gapped model — the
  signature makes `features`/`limits`/`exp` unforgeable, so only date
  manipulation is possible (low value). `nbf` guards pre-dating.
- **Hard expiry.** Expiry is a hard cutoff with clear messaging today. A grace
  window is a later refinement.
- **No revocation.** Pure offline verification cannot revoke an issued token
  before its `exp`. If online revocation is ever needed, it would be added in
  `../aha.chat-enterprise` as an optional online check layered on top — the
  offline signature verify remains the floor.
