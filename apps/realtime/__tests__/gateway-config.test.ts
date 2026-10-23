import { describe, expect, test } from "vitest"
import {
  describeRedisEndpoint,
  resolveRealtimeGatewayConfig,
} from "../src/gateway-config"

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

describe("describeRedisEndpoint", () => {
  test("reports host, port and database without credentials", () => {
    expect(
      describeRedisEndpoint("redis://user:s3cret@redis.internal:6380/3"),
    ).toEqual({ database: "3", host: "redis.internal", port: "6380" })
  })

  test("defaults the database to 0 and the port to the redis default", () => {
    expect(describeRedisEndpoint("redis://localhost")).toEqual({
      database: "0",
      host: "localhost",
      port: "6379",
    })
  })

  test("reads the database from a db query parameter when the path has none", () => {
    expect(describeRedisEndpoint("redis://redis:6379?db=5").database).toBe("5")
  })

  test("prefers the path database over the db query parameter, as ioredis does", () => {
    expect(describeRedisEndpoint("redis://redis:6379/2?db=5").database).toBe(
      "2",
    )
  })

  test("returns placeholders instead of throwing for a URL it cannot parse, without echoing it", () => {
    const endpoint = describeRedisEndpoint("/tmp/redis.sock?password=s3cret")

    expect(endpoint).toEqual({
      database: "unknown",
      host: "unparseable",
      port: "unknown",
    })
  })

  test("never includes the password in the returned fields", () => {
    const endpoint = describeRedisEndpoint("rediss://:s3cret@redis.test:6379/1")

    expect(JSON.stringify(endpoint)).not.toContain("s3cret")
  })
})
