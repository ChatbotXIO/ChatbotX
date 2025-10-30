import type { Node } from "@xyflow/react"
import { createStore } from "zustand"

type SelectOption = {
  value: string
  label: string
}

type CustomFieldOption = {
  label: string
  value: string
  type: string
}

type FlowOption = {
  value: string
  label: string
  nodes: Node[]
}

type TagOption = {
  id: string
  text: string
}

export type StepState = {
  isOpenDialog: boolean
  buttonPath: string | null
  openNodeDetailSheet: boolean
  customFieldOptions: CustomFieldOption[]
  flowOptions: FlowOption[]
  channelOptions: SelectOption[]
  tagOptions: TagOption[]
}

export type StepStore = StepState & {
  setIsOpenDialog: (isOpen: boolean) => void
  setButtonPath: (buttonPath: string | null) => void
  setOpenNodeDetailSheet: (openNodeDetailSheet: boolean) => void
  setCustomFieldOptions: (customFieldOptions: CustomFieldOption[]) => void
  setFlowOptions: (flowOptions: FlowOption[]) => void
  setChannelOptions: (channelOptions: SelectOption[]) => void
  setTagOptions: (tagOptions: TagOption[]) => void
}

export const createStepStore = (initState?: Partial<StepState>) => {
  const defaultProps = {
    isOpenDialog: false,
    buttonPath: null,
    openNodeDetailSheet: false,
    customFieldOptions: [],
    flowOptions: [],
    channelOptions: [
      {
        value: "omnichannel",
        label: "Omnichannel",
      },
    ],
    tagOptions: [],
  }

  return createStore<StepStore>()((set) => ({
    ...defaultProps,
    ...initState,
    setIsOpenDialog: (isOpenDialog) => set({ isOpenDialog }),
    setButtonPath: (buttonPath) => set({ buttonPath }),
    setOpenNodeDetailSheet: (openNodeDetailSheet) =>
      set({ openNodeDetailSheet }),
    setCustomFieldOptions: (customFieldOptions) => set({ customFieldOptions }),
    setFlowOptions: (flowOptions) => set({ flowOptions }),
    setChannelOptions: (channelOptions) => set({ channelOptions }),
    setTagOptions: (tagOptions) => set({ tagOptions }),
  }))
}
