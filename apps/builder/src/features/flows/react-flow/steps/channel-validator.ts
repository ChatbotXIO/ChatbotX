// Moved into `@chatbotx.io/flow-config/channel-rules` so the worker's import
// validation can resolve step validators the same way publish does.
// Re-exported here so existing importers in the builder are unchanged.
export {
  type ChannelValidatorMap,
  resolveStepValidator,
  type StepValidator,
} from "@chatbotx.io/flow-config"
