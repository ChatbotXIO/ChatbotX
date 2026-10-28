"use client"

import { Loader2Icon } from "lucide-react"
// Internal Next export (no public path): the context `useRouter()` reads from.
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime"
import { useLinkStatus } from "next/link"
import { usePathname } from "next/navigation"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import { WorkspaceRouteSkeleton } from "@/components/workspace-skeletons"

// Links inside an element carrying this attribute show their own pending UI
// (e.g. `AppTab`), so the workspace-wide skeleton ignores them.
const LOCAL_NAVIGATION_PENDING_ATTRIBUTE = "data-local-navigation-pending"

// A navigation that never commits (an `onClick` that cancelled the link, a
// redirect back to the same page) must not leave the page hidden for good.
const PENDING_SAFETY_TIMEOUT_MS = 60_000

type SetPendingHref = (
  update: (current: string | null) => string | null,
) => void

const NavigationPendingContext = createContext<string | null>(null)

/** The destination pathname when `href` leaves the current workspace page, else `null`. */
function resolvePendingPathname(href: string): string | null {
  const url = new URL(href, window.location.href)
  if (
    url.origin !== window.location.origin ||
    url.pathname === window.location.pathname ||
    !url.pathname.startsWith("/space/")
  ) {
    return null
  }
  return url.pathname
}

function isPlainLeftClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

/** The in-app link a click follows, or `null` when the browser handles it. */
function findFollowedAnchor(event: MouseEvent): HTMLAnchorElement | null {
  if (!(isPlainLeftClick(event) && event.target instanceof Element)) {
    return null
  }
  const anchor = event.target.closest("a")
  if (
    !anchor?.href ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self") ||
    anchor.closest(`[${LOCAL_NAVIGATION_PENDING_ATTRIBUTE}]`)
  ) {
    return null
  }
  return anchor
}

/**
 * Tracks every navigation started inside the workspace shell — any link click
 * and any `router.push`/`router.replace` — so the page can be swapped for the
 * destination's skeleton at once. `loading.tsx` alone cannot cover this when
 * the route was not prefetched (always in dev, where it also compiles on
 * demand, and for dynamic routes without a deeper `loading.tsx`).
 *
 * `router` calls are caught by re-providing the context `useRouter()` reads,
 * with `push`/`replace` run in a transition so the pending state lasts until
 * the new route commits. Link clicks are caught at the document and cleared
 * when the pathname changes.
 */
export function NavigationPendingProvider({
  children,
}: {
  children: ReactNode
}) {
  const router = useContext(AppRouterContext)
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [isRouterPending, startRouterTransition] = useTransition()
  const wasRouterPending = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a pathname change is the signal that the navigation landed.
  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  useEffect(() => {
    if (wasRouterPending.current && !isRouterPending) {
      setPendingHref(null)
    }
    wasRouterPending.current = isRouterPending
  }, [isRouterPending])

  useEffect(() => {
    if (!pendingHref) {
      return
    }
    const timeout = setTimeout(
      () => setPendingHref(null),
      PENDING_SAFETY_TIMEOUT_MS,
    )
    return () => clearTimeout(timeout)
  }, [pendingHref])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const anchor = findFollowedAnchor(event)
      const destination = anchor && resolvePendingPathname(anchor.href)
      if (destination) {
        setPendingHref(destination)
      }
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  const navigateWithPending = useCallback(
    (navigate: () => void, href: string) => {
      const destination = resolvePendingPathname(href)
      if (!destination) {
        navigate()
        return
      }
      setPendingHref(destination)
      startRouterTransition(navigate)
    },
    [],
  )

  const trackedRouter = useMemo<AppRouterInstance | null>(
    () =>
      router && {
        ...router,
        push: (href, options) =>
          navigateWithPending(() => router.push(href, options), href),
        replace: (href, options) =>
          navigateWithPending(() => router.replace(href, options), href),
      },
    [router, navigateWithPending],
  )

  return (
    <AppRouterContext.Provider value={trackedRouter}>
      <NavigationPendingContext.Provider value={pendingHref}>
        {children}
      </NavigationPendingContext.Provider>
    </AppRouterContext.Provider>
  )
}

/**
 * Rendered inside a `<Link>` to drive a local pending UI (see `AppTab`). The
 * cleanup also runs when the link unmounts mid-navigation, so the local
 * skeleton can never outlive the navigation.
 */
export function LinkPendingReporter({
  href,
  setPendingHref,
}: {
  href: string
  setPendingHref: SetPendingHref
}) {
  const { pending } = useLinkStatus()

  useEffect(() => {
    if (!pending) {
      return
    }
    setPendingHref(() => href)
    return () =>
      setPendingHref((current) => (current === href ? null : current))
  }, [pending, href, setPendingHref])

  return null
}

/**
 * Rendered inside a `<Link>` of an in-page navigation list (marked with
 * `data-local-navigation-pending`): a spinner on that link while its route
 * loads, so the list stays usable instead of being covered by a skeleton.
 */
export function LinkPendingSpinner() {
  const { pending } = useLinkStatus()

  return pending ? (
    <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
  ) : null
}

/**
 * Swaps the page for the destination's skeleton while a navigation is
 * pending. The page stays mounted (only hidden) so an abandoned navigation
 * returns to it intact; `contents` keeps it a direct flex child of the shell.
 */
export function NavigationPendingBoundary({
  children,
}: {
  children: ReactNode
}) {
  const pendingHref = useContext(NavigationPendingContext)

  return (
    <>
      {pendingHref && <WorkspaceRouteSkeleton pathname={pendingHref} />}
      <div className={pendingHref ? "hidden" : "contents"}>{children}</div>
    </>
  )
}
