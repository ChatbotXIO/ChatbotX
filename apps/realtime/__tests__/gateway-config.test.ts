import { describe, expect, test } from "vitest"
import { resolveRealtimeGatewayConfig } from "../src/gateway-config"

const gatewayEnvironment: NodeJS.ProcessEnv = {
  NEXT_PUBLIC_BUILDER_URL: "http://builder.test",
  REALTIME_BROADCAST_SECRET: "gateway-test-secretgateway-test-secret",
  REDIS_URL: "redis://localhost:6379",
}

describe("resolveRealtimeGatewayConfig", () => {
  test("uses REDIS_URL when REDIS_REALTIME_URL is unset", () => {
    expect(resolveRealtimeGatewayConfig(gatewayEnvironment).redisUrl).toBe(
      "redis://localhost:6379",
    )
  })

  test("uses REDIS_REALTIME_URL when it is set", () => {
    expect(
      resolveRealtimeGatewayConfig({
        ...gatewayEnvironment,
        REDIS_REALTIME_URL: "redis://localhost:6380",
      }).redisUrl,
    ).toBe("redis://localhost:6380")
  })

  test("rejects an invalid REDIS_REALTIME_URL", () => {
    expect(() =>
      resolveRealtimeGatewayConfig({
        ...gatewayEnvironment,
        REDIS_REALTIME_URL: "not-a-url",
      }),
    ).toThrow()
  })
})
