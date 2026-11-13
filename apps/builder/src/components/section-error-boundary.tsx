"use client"

import { catchError } from "next/error"
import { type ReactNode, Suspense } from "react"

type SectionErrorBoundaryProps = {
  /** Shown in place of the section when it fails to render. */
  fallback: ReactNode
  children: ReactNode
}

// Next's own error boundary: unlike a hand-written one it lets `redirect()`
// and `notFound()` through.
const FallbackOnError = catchError(
  (props: Pick<SectionErrorBoundaryProps, "fallback">) => props.fallback,
)

/**
 * Keeps one failing section from taking the whole page down: a server
 * component inside that throws shows `fallback` where it was, and the rest of
 * the page stays. The `Suspense` is what lets server rendering hand the failed
 * section to the browser instead of failing the page; the error itself is
 * still logged by the server.
 */
export function SectionErrorBoundary({
  fallback,
  children,
}: SectionErrorBoundaryProps) {
  return (
    <FallbackOnError fallback={fallback}>
      <Suspense fallback={null}>{children}</Suspense>
    </FallbackOnError>
  )
}
