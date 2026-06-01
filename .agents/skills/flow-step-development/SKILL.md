---
name: flow-step-development
description: >-
  Add new flow steps with state-based routing (success/error/skip). Covers
  the full lifecycle: flow-config schema, worker handler, builder viewer,
  and step registration. Use when creating any step that branches to a
  different node based on its outcome.
---

# Flow Step Development

## Architecture Overview

A **step** is the unit of work inside a flow node. Steps execute sequentially within a node. After each step, the worker checks the result status and may route to a different node.

```
Node
├── beforeStep (optional)
└── steps[]
    ├── Step A → returns { status: "success" }  → routes to connected node via state.id
    ├── Step B → returns { status: "error" }    → routes to connected node via state.id
    └── Step C → returns { status: "wait" }     → pauses execution, resumes later
```

## State Design

States live **on the step**, not on the node. Each state has:

| Field | Purpose |
|-------|---------|
| `id` | React Flow **Handle ID** — used as `sourceHandle` in edges to connect to a target node |
| `stateType` | `"success"` \| `"error"` \| `"skip"` |
| `nodeId` | *(future)* Direct target node ID for programmatic flow generation (no edge needed) |

### Why `nodeId` on state (future use)

When flows are **generated programmatically** (e.g. by AI, import, or API), there are no React Flow edges. Setting `state.nodeId` directly lets the worker route without edge lookup:

```
// Worker routing (flow.ts — executeMultipleStepsGenerator)
const connectedNodeId = targetState.nodeId          // prefer direct nodeId
  || seekConnectedNode(flowVersion, targetState.id)  // fall back to edge lookup
```

Until `nodeId` is added to the schema, routing always uses edge lookup via `state.id`.

### State Schema (`packages/flow-config/src/states`)

```typescript
// current
baseStateSchema = { id, stateType }

// planned addition
baseStateSchema = { id, stateType, nodeId?: string }
```

## Step Status Types

A step handler returns `ExecuteStepResult`:

```typescript
type StepRoutingStatus = "success" | "error" | "skip"

type ExecuteStepResult = {
  status: "success" | "error" | "skip" | "wait" | "retry"
  result: unknown
  errorMessage?: string
}
```

| Status | Meaning |
|--------|---------|
| `success` | Step completed — route via success state |
| `error` | Step failed — route via error state |
| `skip` | Step skipped (e.g. condition not met) — route via skip state |
| `wait` | Pause execution — job returns, resumes via BullMQ when condition met |
| `retry` | Transient failure — caller re-enqueues |
| `void` (no return) | Fire-and-forget — implicit success, no routing |

Only `success`, `error`, and `skip` trigger state-based routing to a connected node.

---

## Adding a New Step with States

### Step 1 — Define the schema in `packages/flow-config`

Create or update `src/steps/<step-name>.ts`:

```typescript
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const myStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.myStep),
  // ... step-specific fields
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type MyStepSchema = z.infer<typeof myStepSchema>

export const myStepDefaultFn = (): MyStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.myStep,
  // ... defaults
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
```

**When to add a `skip` state**: only when the step has a meaningful "no-op but not an error" outcome — e.g. `getUserData` skips when the user doesn't respond. Most action steps use only `[success, error]`.

Export from `packages/flow-config/src/steps/index.ts` and `packages/flow-config/src/index.ts`.

### Step 2 — Register the step type

Add the key to `stepTypes` in `packages/flow-config/src/steps/step-action.ts`.

### Step 3 — Write the worker handler

In `apps/worker/src/integration/handlers/`:

```typescript
// my-step-handler.ts
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export async function handleMyStep(
  props: ExecuteStepProps<MyStepSchema>,
): Promise<ExecuteStepResult> {
  const { step, conversation } = props

  try {
    // ... do work
    return { status: "success", result: null }
  } catch (error) {
    logger.error({ err: error, conversationId: conversation.id }, "[handleMyStep] failed")
    return { status: "error", result: null, errorMessage: String(error) }
  }
}
```

**Fire-and-forget steps** (no routing needed): return `void` instead of `ExecuteStepResult`. The executor treats `void` as implicit success and continues to the next step without routing.

### Step 4 — Register in `step.ts`

Add to the `flowStepHandlers` map in `apps/worker/src/integration/handlers/step.ts`:

```typescript
export const flowStepHandlers: Partial<Record<StepType, StepHandler>> = {
  // ...existing
  [stepTypes.enum.myStep]: handleMyStep,
}
```

### Step 5 — Build the viewer (builder)

Create `apps/builder/src/features/flows/react-flow/steps/<my-step>/viewer.tsx`:

```typescript
"use client"

import type { MyStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { MyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

const MyStepViewer = ({ data }: { data: MyStepSchema }) => {
  const t = useTranslations()
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer icon={MyIcon} title={t("flows.actions.myStep")} />
        </div>
        <div className="my-2 mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer data={state} key={state.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default MyStepViewer
```

**Always use `data.states.map(<BaseStateViewer>)`** — never manually `.find()` individual states and render custom handles. This ensures all state types render correctly and future state types work automatically.

`BaseStateViewer` handles coloring (green = success, red = error, yellow = skip), labels, and the `BaseHandle` with connected-state visuals.

### Step 6 — Register the step definition

In `apps/builder/src/features/flows/react-flow/steps/<my-step>/index.ts`:

```typescript
import type { MyStepSchema } from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import MyStepViewer from "./viewer"
import { MyStepEditor } from "./editor"

export const myStep: StepDefinition<MyStepSchema> = {
  editor: MyStepEditor,
  viewer: MyStepViewer,
  validator: myStepSchema,
  defaultFn: myStepDefaultFn,
}
```

---

## Routing Mechanics (Worker)

The routing loop in `apps/worker/src/integration/handlers/flow.ts` (`executeMultipleStepsGenerator`):

1. Execute the step → get `ExecuteStepResult`
2. If status is `success | error | skip`, find the matching state: `step.states.find(s => s.stateType === result.status)`
3. Call `seekConnectedNode(flowVersion, targetState.id)` — looks up an edge where `edge.sourceHandle === targetState.id`
4. If a connected node is found, enqueue a new `sendFlow` job for that node and set `branched = true`
5. If `branched`, stop processing remaining steps in the current node
6. If not branched (no edge connected), continue to the next step in the node

```typescript
// flow-utils.ts
export const seekConnectedNode = (flowVersion, sourceId) =>
  (flowVersion.edges as EdgeSchema[])
    .find(edge => edge.sourceHandle === sourceId)?.target
```

### Default fallback behaviour

If a step returns `success`/`error`/`skip` **and** no edge is connected to that state handle, execution continues to the **next step in the current node** (no branch). When the last step finishes with no branch, the node's outgoing edge (from the node handle itself) is followed.

---

## Common Mistakes

| Mistake | Correct approach |
|---------|-----------------|
| Rendering only `successState` and `errorState` with `.find()` | Use `data.states.map(<BaseStateViewer>)` |
| Using `<Handle>` from `@xyflow/react` directly in viewers | Use `<BaseStateViewer>` which wraps `<BaseHandle>` |
| Returning `void` from a step that should branch | Return `{ status: "success" | "error", result }` |
| Hardcoding state IDs | Always use `createId()` via `successStateDefaultFn()` / `errorStateDefaultFn()` |
| Adding `successNodeId` / `errorNodeId` directly to the step schema | Use `states` array; routing target is expressed via edges (or future `state.nodeId`) |
