import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const editionRule = z
  .enum(["community", "enterprise", "cloud"])
  .default("community")

export const env = createEnv({
  server: {
    NEXT_PUBLIC_EDITION: editionRule,
    QUOTA_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
    WEBHOOK_WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50),
    INTEGRATION_WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(10),
    // Bounds each chat-job wait (awaitChatJob). Capped below the integration
    // worker lockDuration (10 min) so a wait can never outlive the job lock —
    // otherwise BullMQ would treat the job as stalled and reprocess it (double
    // send). Validated so a bad value can't become NaN (= wait forever).
    CHAT_JOB_WAIT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(9 * 60 * 1000)
      .default(120_000),
    NOTIFICATION_WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(10),
    // Expo push access token. Only needed if Expo's "enhanced push security"
    // is enabled on the project; unauthenticated requests work otherwise.
    EXPO_ACCESS_TOKEN: z.string().optional(),
    // Kill switch — Expo needs no credential to send, so unlike FCM there is
    // no natural "unset = disabled" signal. Operators flip this explicitly.
    EXPO_PUSH_ENABLED: z.stringbool().default(true),

    // --- FreeSWITCH calling ("many nodes" sharding-by-workspace) ---
    // This node's id — matches an `FS_NODES` key and the FreeSWITCH
    // container's `switchname` (`vars.xml`). "default" for a single-node
    // (N=1) deployment, so most deployments never set this at all.
    FS_NODE_ID: z.string().min(1).default("default"),
    // JSON `{ "<nodeId>": { sipDomain, wssUrl, turnUrl } }` — optional; a
    // single-node deployment derives its one node from the `FS_*`/`TURN_*`
    // vars below instead (see `resolveFreeswitchNode`/`parseFreeswitchNodes`
    // in `packages/business/src/whatsapp-call/freeswitch-nodes.ts`).
    FS_NODES: z.string().optional(),
    FS_ESL_HOST: z.string().min(1).default("127.0.0.1"),
    FS_ESL_PORT: z.coerce.number().int().min(1).max(65_535).default(8021),
    FS_ESL_PASSWORD: z.string().optional(),
    // Local volume the co-located `freeswitch` worker reads recordings from
    // and writes uploaded files' local copies until they're deleted.
    // Where THIS worker sees the node's recordings volume (host path in
    // local dev, the container mount in production).
    RECORDINGS_DIR: z.string().min(1).default("/recordings"),
    // The same volume as FreeSWITCH names it in `RECORD_STOP`'s
    // Record-File-Path (the builder's FS_RECORDINGS_DIR); event paths are
    // remapped from this prefix onto RECORDINGS_DIR.
    FS_RECORDINGS_DIR: z.string().min(1).default("/recordings"),
    FS_SIP_DOMAIN: z.string().optional(),
    FS_WSS_URL: z.string().optional(),
    TURN_URL: z.string().optional(),
    // Rate-limits the opt-in call-transcription queue so a call
    // spike cannot burn the AI budget.
    CALL_TRANSCRIBE_PER_MIN: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(10),
  },
  runtimeEnv: process.env,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})
