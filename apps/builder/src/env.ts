import { keys as database } from "@chatbotx.io/database/keys"
import { keys as mail } from "@chatbotx.io/mail/keys"
import { keys as partysocket } from "@chatbotx.io/partysocket-config/keys"
import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"
import { clientEnv } from "./lib/client-env"

const editionRule = z
  .enum(["community", "enterprise", "cloud"])
  .default("community")

export const env = createEnv({
  extends: [partysocket(), database(), mail()],
  server: {
    PLATFORM_ADMIN_EMAIL: z.email().optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.url(),
    LICENSE_KEY: z.string().optional(),
    WHATSAPP_OVERRIDE_CALLBACK_URI: z.url().optional(),
    // FreeSWITCH WhatsApp calling (docs/whatsapp-calling.md):
    // `FS_NODES` is the multi-node JSON map `{ "<nodeId>": { sipDomain,
    // wssUrl, turnUrl } }`; when unset, `parseFreeswitchNodes` (from
    // `@chatbotx.io/business`) falls back to a single "default" node built
    // from the scalar `FS_SIP_DOMAIN`/`FS_WSS_URL`/`TURN_URL` vars below — so
    // a single-node deployment never needs to set `FS_NODES` at all.
    FS_NODES: z.string().optional(),
    FS_SIP_DOMAIN: z.string().optional(),
    FS_WSS_URL: z.url().optional(),
    TURN_URL: z.string().optional(),
    TURN_STATIC_SECRET: z.string().optional(),
    // HTTP Basic credentials + IP allowlist the `mod_xml_curl` responder
    // (`/api/freeswitch/xml`) checks before ever touching the database.
    FS_XML_BASIC_USER: z.string().optional(),
    FS_XML_BASIC_PASS: z.string().optional(),
    FS_XML_ALLOWED_IPS: z
      .string()
      .optional()
      .transform((val) =>
        val
          ?.split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    FS_MAX_RING_TARGETS: z.coerce.number().int().positive().default(8),
    // Recordings path INSIDE the FreeSWITCH container — rendered literally
    // into the dialplan's `record_session`. The `freeswitch`
    // worker maps this prefix onto its own mount via its RECORDINGS_DIR.
    FS_RECORDINGS_DIR: z.string().min(1).default("/recordings"),
    // Reverse-proxy CIDRs trusted to prepend `X-Forwarded-For` hops in front
    // of the real client IP (e.g. the ingress load balancer). Required for
    // `FS_XML_ALLOWED_IPS` to mean anything — without it the header is
    // attacker-controlled and the allowlist check is skipped entirely (see
    // `freeswitch-xml-rate-limit.ts`).
    FS_XML_TRUSTED_PROXY_CIDRS: z
      .string()
      .optional()
      .transform((val) =>
        val
          ?.split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
  },
  client: {
    NEXT_PUBLIC_BUILDER_URL: z.url(),
    // Dedicated, brand-neutral broker host — the canonical provider-facing origin
    // for both OAuth redirect_uris and host-validated webhooks (WhatsApp/Meta,
    // TikTok). The single redirect_uri registered with every provider; callbacks
    // relay back to the originating domain. Optional — falls back to
    // NEXT_PUBLIC_BUILDER_URL via getBrokerUrl().
    NEXT_PUBLIC_BROKER_URL: z.url().optional(),
    NEXT_PUBLIC_EDITION: editionRule,
    NEXT_PUBLIC_INTERNAL_WS_URL: z
      .url()
      .optional()
      .default("http://localhost:1999"),
    NEXT_PUBLIC_INTERNAL_STORAGE_URL: z
      .url()
      .optional()
      .default("http://localhost:9000/chatbotx/"),
    NEXT_PUBLIC_STORAGE_URL: z.url().optional(),
    NEXT_PUBLIC_PANCAKE_CHAT_PAGE_ID: z.string().optional(),
    NEXT_PUBLIC_ALLOWED_DEV_ORIGINS: z
      .string()
      .optional()
      .transform((val) =>
        val
          ?.split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_BUILDER_URL:
      clientEnv("NEXT_PUBLIC_BUILDER_URL") || "http://localhost:3123",
    NEXT_PUBLIC_BROKER_URL: clientEnv("NEXT_PUBLIC_BROKER_URL"),
    NEXT_PUBLIC_INTERNAL_WS_URL:
      clientEnv("NEXT_PUBLIC_INTERNAL_WS_URL") || "http://localhost:1999",
    NEXT_PUBLIC_INTERNAL_STORAGE_URL:
      clientEnv("NEXT_PUBLIC_INTERNAL_STORAGE_URL") ||
      "http://localhost:9000/chatbotx/",
    NEXT_PUBLIC_EDITION: clientEnv("NEXT_PUBLIC_EDITION") || "community",
    NEXT_PUBLIC_STORAGE_URL: clientEnv("NEXT_PUBLIC_STORAGE_URL"),
    NEXT_PUBLIC_PANCAKE_CHAT_PAGE_ID: clientEnv(
      "NEXT_PUBLIC_PANCAKE_CHAT_PAGE_ID",
    ),
    NEXT_PUBLIC_ALLOWED_DEV_ORIGINS: clientEnv(
      "NEXT_PUBLIC_ALLOWED_DEV_ORIGINS",
    ),
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})

export const isEnterprise = () => env.NEXT_PUBLIC_EDITION === "enterprise"
export const isCloud = () => env.NEXT_PUBLIC_EDITION === "cloud"
export const isCommunity = () => env.NEXT_PUBLIC_EDITION === "community"
