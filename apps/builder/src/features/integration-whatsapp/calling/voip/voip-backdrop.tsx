"use client"

/**
 * Full-screen dim backdrop shown while nothing else is grabbing the agent's
 * attention — a fresh incoming ring, or the free-slot basket card/list —
 * and never while the call slot is engaged (dimming the screen mid-call
 * would be wrong). Extracted once so the three call sites
 * (`WhatsappCallPanel`'s single-ring and incoming-ring branches, and
 * `WhatsappRingingCallsList`'s free-slot branch) can't drift on the exact
 * z-index/opacity/animation, which is exactly what happened before this was
 * factored out (see FIX 6 in the multi-ring design review).
 */
export function VoipBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="motion-safe:fade-in fixed inset-0 z-40 bg-black/40 motion-safe:animate-in"
    />
  )
}
