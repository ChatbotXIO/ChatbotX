/**
 * Inbox translation's provider layer, on its own package subpath
 * (`@chatbotx.io/ai/translation`) instead of the `server` barrel.
 *
 * The builder's session oRPC router reads translation settings and has to know
 * whether the chosen integration still works, which needs
 * `resolveTranslationModel`. The barrel also re-exports modules that use
 * `node:crypto`, and Next traces the whole router graph into the Edge
 * instrumentation bundle (AGENTS.md invariant 25), so the router imports only
 * this file. Keep it free of Node-only imports.
 */
export * from "./services/translation-model"
export * from "./services/translator"
