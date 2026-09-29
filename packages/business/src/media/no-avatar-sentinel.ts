// The no-avatar sentinel helpers are pure string/time logic with no server
// dependencies, so they live in @chatbotx.io/utils and can be shared with
// client code (e.g. useAvatarUrl). Re-exported here to keep the existing
// business-layer import paths stable.
export * from "@chatbotx.io/utils/no-avatar-sentinel"
