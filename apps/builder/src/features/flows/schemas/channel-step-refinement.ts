// Moved into `@chatbotx.io/flow-config/channel-rules` so the worker's import
// validation can share the same per-channel publish rules. Re-exported here so
// existing importers (`../schemas/action`, the client `updateFlowVersionSchema`)
// are unchanged.
export { refineStepsByChannel } from "@chatbotx.io/flow-config"
