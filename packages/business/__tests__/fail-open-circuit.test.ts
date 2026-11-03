import { describe, expect, test } from "vitest"
import { FailOpenCircuit } from "../src/trigger/fail-open-circuit"

const BACKOFF_MS = 5000

const buildCircuit = () => {
  let now = 1_000_000
  const circuit = new FailOpenCircuit(BACKOFF_MS, () => now)
  return {
    circuit,
    advance: (ms: number) => {
      now += ms
    },
    /** A caller that must be let through. */
    enter: (): number => {
      const token = circuit.tryEnter()
      if (token === null) {
        throw new Error("expected the circuit to admit the caller")
      }
      return token
    },
  }
}

describe("FailOpenCircuit", () => {
  test("lets every caller through while closed", () => {
    const { circuit } = buildCircuit()

    expect(circuit.tryEnter()).not.toBeNull()
    expect(circuit.tryEnter()).not.toBeNull()
  })

  test("the first failure opens it, reports the outage, and callers skip for the whole backoff", () => {
    const { circuit, enter, advance } = buildCircuit()

    expect(circuit.recordFailure(enter())).toBe(true)
    expect(circuit.tryEnter()).toBeNull()

    advance(BACKOFF_MS - 1)
    expect(circuit.tryEnter()).toBeNull()
  })

  test("lets exactly one probe through after the backoff", () => {
    const { circuit, enter, advance } = buildCircuit()
    circuit.recordFailure(enter())
    advance(BACKOFF_MS)

    expect(circuit.tryEnter()).not.toBeNull()
    expect(circuit.tryEnter()).toBeNull()
  })

  test("a successful probe closes the circuit and reports the recovery", () => {
    const { circuit, enter, advance } = buildCircuit()
    circuit.recordFailure(enter())
    advance(BACKOFF_MS)

    expect(circuit.recordSuccess(enter())).toBe(true)
    expect(circuit.tryEnter()).not.toBeNull()
    expect(circuit.tryEnter()).not.toBeNull()
  })

  test("a failed probe reopens the backoff without reporting a new outage", () => {
    const { circuit, enter, advance } = buildCircuit()
    circuit.recordFailure(enter())
    advance(BACKOFF_MS)

    expect(circuit.recordFailure(enter())).toBe(false)
    expect(circuit.tryEnter()).toBeNull()

    advance(BACKOFF_MS)
    expect(circuit.tryEnter()).not.toBeNull()
  })

  test("a success while closed is not a recovery", () => {
    const { circuit, enter } = buildCircuit()

    expect(circuit.recordSuccess(enter())).toBe(false)
  })

  test("a new outage after a recovery is reported again", () => {
    const { circuit, enter, advance } = buildCircuit()
    circuit.recordFailure(enter())
    advance(BACKOFF_MS)
    circuit.recordSuccess(enter())

    expect(circuit.recordFailure(enter())).toBe(true)
  })

  describe("calls admitted before the circuit opened finish late", () => {
    test("their failures neither report the outage again nor extend the backoff", () => {
      const { circuit, enter, advance } = buildCircuit()
      const first = enter()
      const second = enter()
      circuit.recordFailure(first)
      advance(BACKOFF_MS - 1)

      expect(circuit.recordFailure(second)).toBe(false)

      advance(1)
      expect(circuit.tryEnter()).not.toBeNull()
    })

    test("a late success does not close the circuit while it is open or probing", () => {
      const { circuit, enter, advance } = buildCircuit()
      const failing = enter()
      const slowSuccess = enter()
      circuit.recordFailure(failing)

      expect(circuit.recordSuccess(slowSuccess)).toBe(false)
      expect(circuit.tryEnter()).toBeNull()

      advance(BACKOFF_MS)
      const probe = enter()
      expect(circuit.recordSuccess(slowSuccess)).toBe(false)
      expect(circuit.tryEnter()).toBeNull()
      expect(circuit.recordSuccess(probe)).toBe(true)
    })

    test("a late failure while the probe is out does not restart the backoff", () => {
      const { circuit, enter, advance } = buildCircuit()
      const failing = enter()
      const slowFailure = enter()
      circuit.recordFailure(failing)
      advance(BACKOFF_MS)
      const probe = enter()

      expect(circuit.recordFailure(slowFailure)).toBe(false)
      expect(circuit.recordSuccess(probe)).toBe(true)
    })

    test("a late outcome after a recovery leaves the recovered circuit alone", () => {
      const { circuit, enter, advance } = buildCircuit()
      const stale = enter()
      circuit.recordFailure(enter())
      advance(BACKOFF_MS)
      circuit.recordSuccess(enter())

      expect(circuit.recordFailure(stale)).toBe(false)
      expect(circuit.tryEnter()).not.toBeNull()
    })
  })
})
