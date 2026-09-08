import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { vi } from "vitest"
import {
  type ConnectAfterConnect,
  type UseConnectBatchResult,
  useConnectBatch,
} from "@/features/channel-connect/hooks/use-connect-batch"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"

/**
 * Shared probe + fixtures for the `useConnectBatch` suite, split across
 * `use-connect-batch.test.tsx` (core batch behaviour),
 * `use-connect-batch.coexist.test.tsx` (the coexist phase) and
 * `use-connect-batch.parallelism.test.tsx`. Each file registers its own
 * `afterEach(cleanupProbe)` — lifecycle stays file-scoped, only the plumbing
 * lives here.
 */

export type Item = {
  id: string
  name: string
  coexist?: boolean
  aiReadsSyncedHistory?: boolean
}

const holder: { current: UseConnectBatchResult | null } = { current: null }
let container: HTMLDivElement | null = null
let root: Root | null = null

export function getApi(): UseConnectBatchResult {
  if (!holder.current) {
    throw new Error("useConnectBatch probe has not rendered yet")
  }
  return holder.current
}

type ProbeProps = {
  items: Item[]
  concurrency: number
  connectOne: (item: Item) => Promise<ConnectActionResultWire>
  afterConnect?: ConnectAfterConnect<Item>
}

function Probe({ items, concurrency, connectOne, afterConnect }: ProbeProps) {
  const api = useConnectBatch({ items, concurrency, connectOne, afterConnect })
  useEffect(() => {
    holder.current = api
  })
  return null
}

export function renderProbe(props: ProbeProps) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<Probe {...props} />)
  })
}

export function cleanupProbe() {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  holder.current = null
  vi.useRealTimers()
}

export function outcome(
  overrides: Partial<ConnectActionResultWire & { kind: "outcome" }> = {},
): ConnectActionResultWire {
  return {
    kind: "outcome",
    outcome: {
      sourceId: "id",
      name: "name",
      status: "connected",
      coexistEligible: false,
    },
    ...overrides,
  } as ConnectActionResultWire
}

export const items3: Item[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
]
