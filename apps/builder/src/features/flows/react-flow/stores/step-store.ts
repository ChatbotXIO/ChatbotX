import { createStore } from "zustand"
import type { CustomFieldResource } from "@/features/custom-fields/schemas"
import type { FlowResource } from "@/features/flows/schemas/get-flows-schema"

export type StepState = {
  isOpenDialog: boolean
  buttonPath: string | null
  openNodeDetailSheet: boolean
  customFields: CustomFieldResource[]
  flows: FlowResource[]
}

export type StepStore = StepState & {
  setIsOpenDialog: (isOpen: boolean) => void
  setButtonPath: (buttonPath: string | null) => void
  setOpenNodeDetailSheet: (openNodeDetailSheet: boolean) => void
  setCustomFields: (customFields: CustomFieldResource[]) => void
  setFlows: (flows: FlowResource[]) => void
}

export const createStepStore = (initState?: Partial<StepState>) => {
  const defaultProps = {
    isOpenDialog: false,
    buttonPath: null,
    openNodeDetailSheet: false,
    customFields: [],
    flows: [],
  }

  return createStore<StepStore>()((set) => ({
    ...defaultProps,
    ...initState,
    setIsOpenDialog: (isOpenDialog) => set({ isOpenDialog }),
    setButtonPath: (buttonPath) => set({ buttonPath }),
    setOpenNodeDetailSheet: (openNodeDetailSheet) =>
      set({ openNodeDetailSheet }),
    setCustomFields: (customFields) => set({ customFields }),
    setFlows: (flows) => set({ flows }),
  }))
}
