// Node-only IMAP helpers (imapflow/mailparser), exposed as their own subpath so
// the builder's Edge-traced router graph never imports them via `index.ts`
// (AGENTS.md invariant 25). Used by actions, the public API and workers only.
export { resolveImapConnection, verifyImap } from "./handlers/verify-imap"
export {
  DEFAULT_IMAP_MAILBOX,
  MAX_MESSAGES_PER_POLL,
} from "./inbound/constants"
export type { FetchedMail, ImapFetchResult } from "./inbound/imap"
export { fetchNewMessages } from "./inbound/imap"
