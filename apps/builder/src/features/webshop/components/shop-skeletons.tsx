import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import type { ReactNode } from "react"

const GRID_PLACEHOLDERS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
const LINE_PLACEHOLDERS = ["a", "b", "c"]

/** The shop's header and page frame, drawn while a shop page loads. */
function ShopSkeletonFrame({ children }: { children: ReactNode }) {
  return (
    <div
      aria-busy
      className="min-h-screen bg-gradient-to-b from-muted/60 to-muted/20"
      role="status"
    >
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
    </div>
  )
}

export function ProductGridSkeleton() {
  return (
    <ShopSkeletonFrame>
      <div className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-10 flex-1 rounded-full" />
          <Skeleton className="h-10 rounded-full sm:w-48" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {GRID_PLACEHOLDERS.map((key) => (
            <div
              className="overflow-hidden rounded-md border bg-card shadow-xs"
              key={key}
            >
              <Skeleton className="aspect-square rounded-none" />
              <div className="space-y-2 p-2.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="mt-3 h-6 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ShopSkeletonFrame>
  )
}

export function ProductDetailSkeleton() {
  return (
    <ShopSkeletonFrame>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="aspect-square rounded-2xl" />
          <div className="flex gap-2">
            {LINE_PLACEHOLDERS.map((key) => (
              <Skeleton className="size-16 rounded-xl" key={key} />
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full rounded-full" />
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
      </div>
    </ShopSkeletonFrame>
  )
}

export function CartSkeleton() {
  return (
    <ShopSkeletonFrame>
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-7 w-32" />
        <div className="divide-y rounded-2xl border bg-card px-4 shadow-sm">
          {LINE_PLACEHOLDERS.map((key) => (
            <div className="flex gap-3 py-4" key={key}>
              <Skeleton className="size-20 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-8 w-28 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </ShopSkeletonFrame>
  )
}

export function OrderSkeleton() {
  return (
    <ShopSkeletonFrame>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-1/2" />
          {LINE_PLACEHOLDERS.map((key) => (
            <Skeleton className="h-5 w-full" key={key} />
          ))}
          <Skeleton className="h-6 w-full" />
        </div>
        <Skeleton className="h-10 w-full rounded-full" />
      </div>
    </ShopSkeletonFrame>
  )
}
