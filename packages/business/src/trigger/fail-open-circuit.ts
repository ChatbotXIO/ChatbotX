/**
 * Fail-open circuit for an optional dependency on a hot path (the trigger run
 * limiter). Closed: calls go through. A failure opens it for `backoffMs`,
 * during which callers skip the dependency instead of each paying its timeout.
 * When the backoff ends exactly one caller is let through as a probe; the
 * others keep skipping until the probe reports back, so a hung dependency sees
 * one stalled call per backoff instead of a burst. Per process, on a monotonic
 * clock, so a wall-clock step cannot stretch or cut the backoff.
 *
 * `tryEnter` hands out a token (the number of times the circuit had opened) that
 * must be passed back with the outcome. A call admitted before the circuit
 * opened can still finish afterwards, in any order; its token is older than the
 * current one, so its outcome is ignored and only the probe can close or
 * re-open an open circuit.
 */
export class FailOpenCircuit {
  private readonly backoffMs: number
  private readonly nowMs: () => number
  private state: "closed" | "open" | "probing" = "closed"
  private generation = 0
  private openUntilMs = 0

  constructor(
    backoffMs: number,
    nowMs: () => number = () => performance.now(),
  ) {
    this.backoffMs = backoffMs
    this.nowMs = nowMs
  }

  /** A token to pass back with the outcome, or `null` when the caller should skip the dependency. */
  tryEnter(): number | null {
    if (this.state === "open" && this.nowMs() >= this.openUntilMs) {
      this.state = "probing"
      return this.generation
    }
    return this.state === "closed" ? this.generation : null
  }

  /** Returns `true` when this success is the probe's and closes the circuit (a recovery). */
  recordSuccess(token: number): boolean {
    if (!this.isProbe(token)) {
      return false
    }
    this.state = "closed"
    return true
  }

  /**
   * Returns `true` only when this failure opens a closed circuit, i.e. the
   * start of an outage: calls already in flight when it began fail together and
   * must not each report it. A failed probe reopens the backoff silently.
   */
  recordFailure(token: number): boolean {
    if (token !== this.generation) {
      return false
    }
    if (this.state === "closed") {
      this.open()
      return true
    }
    if (this.state === "probing") {
      this.open()
    }
    return false
  }

  private isProbe(token: number): boolean {
    return token === this.generation && this.state === "probing"
  }

  private open(): void {
    this.generation += 1
    this.state = "open"
    this.openUntilMs = this.nowMs() + this.backoffMs
  }
}
