/**
 * The post-writing provider call, on its own package subpath
 * (`@chatbotx.io/ai/post-writer`) so the builder's oRPC router graph imports
 * only this file, not the `server` barrel (Node-only imports; AGENTS.md
 * invariant 25). Model resolution is the Inbox translation one
 * (`@chatbotx.io/ai/translation`).
 */
export * from "./services/post-writer"
