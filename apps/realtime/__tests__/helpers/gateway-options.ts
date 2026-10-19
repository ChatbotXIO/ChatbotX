import type { RealtimeGatewayOptions } from "../../src/gateway"
import { resolveRealtimeGatewayConfig } from "../../src/gateway-config"

const testEnvironment: NodeJS.ProcessEnv = {
  NEXT_PUBLIC_BUILDER_URL: "http://builder.test",
  REALTIME_BROADCAST_SECRET: "gateway-test-secretgateway-test-secret",
  REALTIME_SHUTDOWN_DRAIN_MS: "0",
  REDIS_URL: "redis://localhost:6379",
}

export const testGatewayOptions = (
  overrides: Pick<RealtimeGatewayOptions, "redis"> &
    Partial<Omit<RealtimeGatewayOptions, "redis">>,
): RealtimeGatewayOptions => ({
  ...resolveRealtimeGatewayConfig(testEnvironment),
  ...overrides,
})
