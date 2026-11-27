// The shared preset, not a bespoke config: it carries the 30s test/hook
// timeouts, the CI worker budget and the env defaults every other suite
// runs under. A standalone `defineConfig` here silently fell back to vitest's
// 5s/10s defaults, the lowest in the repo.
export { default } from "@chatbotx.io/vitest-config/node"
