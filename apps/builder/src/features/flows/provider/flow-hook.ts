import { useMemo } from "react"
import { useFlowStore } from "./flow-store-context"

export const useFlowSelectOptions = () => {
  const { flows } = useFlowStore((state) => state)

  return useMemo(
    () =>
      flows.map((flow) => ({
        label: flow.name,
        value: flow.id,
      })),
    [flows],
  )
}
