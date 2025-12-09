import type { OrganizationSettings } from "@aha.chat/database/types"
import type { Node } from "@xyflow/react"
import { createStore } from "zustand"

type SelectOption = {
  value: string
  label: string
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
  flowOptions: FlowOption[]
  channelOptions: SelectOption[]
  tagOptions: TagOption[]
  organizationSetings: OrganizationSettings | null
}

export type StepStore = StepState & {
  setIsOpenDialog: (isOpen: boolean) => void
  setButtonPath: (buttonPath: string | null) => void
  setOpenNodeDetailSheet: (openNodeDetailSheet: boolean) => void
  setFlowOptions: (flowOptions: FlowOption[]) => void
  setChannelOptions: (channelOptions: SelectOption[]) => void
  setTagOptions: (tagOptions: TagOption[]) => void
  setOrganizationSetings: (
    organizationSetings: OrganizationSettings | null,
  ) => void
}

export const createStepStore = (initState?: Partial<StepState>) => {
  const defaultProps = {
    isOpenDialog: false,
    buttonPath: null,
    openNodeDetailSheet: false,
    flowOptions: [],
    channelOptions: [
      {
        value: "omnichannel",
        label: "Omnichannel",
      },
    ],
    tagOptions: [],
    organizationSetings: null,
  }

  return createStore<StepStore>()((set) => ({
    ...defaultProps,
    ...initState,
    setIsOpenDialog: (isOpenDialog) => set({ isOpenDialog }),
    setButtonPath: (buttonPath) => set({ buttonPath }),
    setOpenNodeDetailSheet: (openNodeDetailSheet) =>
      set({ openNodeDetailSheet }),
    setFlowOptions: (flowOptions) => set({ flowOptions }),
    setChannelOptions: (channelOptions) => set({ channelOptions }),
    setTagOptions: (tagOptions) => set({ tagOptions }),
    setOrganizationSetings: (organizationSetings) =>
      set({ organizationSetings }),
  }))
}
