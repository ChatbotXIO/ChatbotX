import { describe, expect, test } from "vitest"
import {
  DEFAULT_FREESWITCH_NODE_ID,
  parseFreeswitchNodes,
  resolveFreeswitchNode,
  UnknownFreeswitchNodeError,
} from "../src/whatsapp-call/freeswitch-nodes"

const fallback = {
  sipDomain: "fs.example.com",
  wssUrl: "wss://fs.example.com:7443",
  turnUrl: "turn:fs.example.com:3478",
}

describe("parseFreeswitchNodes", () => {
  test("falls back to a single 'default' node when FS_NODES is unset", () => {
    expect(parseFreeswitchNodes(undefined, fallback)).toEqual({
      [DEFAULT_FREESWITCH_NODE_ID]: fallback,
    })
  })

  test("parses a multi-node FS_NODES JSON map", () => {
    const nodes = parseFreeswitchNodes(
      JSON.stringify({
        a: { sipDomain: "a.example.com", wssUrl: "wss://a", turnUrl: "turn:a" },
        b: { sipDomain: "b.example.com", wssUrl: "wss://b", turnUrl: "turn:b" },
      }),
      fallback,
    )
    expect(Object.keys(nodes).sort()).toEqual(["a", "b"])
  })

  test("throws on malformed JSON", () => {
    expect(() => parseFreeswitchNodes("{not json", fallback)).toThrow()
  })

  test("throws when an entry is missing a required field", () => {
    expect(() =>
      parseFreeswitchNodes(JSON.stringify({ a: { sipDomain: "a" } }), fallback),
    ).toThrow()
  })
})

describe("resolveFreeswitchNode", () => {
  const nodes = parseFreeswitchNodes(undefined, fallback)

  test("resolves a known node", () => {
    expect(resolveFreeswitchNode(nodes, DEFAULT_FREESWITCH_NODE_ID)).toEqual(
      fallback,
    )
  })

  test("throws UnknownFreeswitchNodeError for an unknown id", () => {
    expect(() => resolveFreeswitchNode(nodes, "nope")).toThrow(
      UnknownFreeswitchNodeError,
    )
  })
})
