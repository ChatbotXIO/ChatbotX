"use client"

/**
 * Full-screen dim backdrop shown while nothing else is grabbing the agent's
 * attention, and never while the call slot is engaged (dimming mid-call would
 * be wrong). Shared so the multiple call sites can't drift on
 * z-index/opacity/animation.
 */
export function VoipBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="motion-safe:fade-in fixed inset-0 z-40 bg-black/40 motion-safe:animate-in"
    />
  )
}
