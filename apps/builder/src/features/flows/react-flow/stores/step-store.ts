import type { OrganizationSettings } from "@aha.chat/database/types"
import type { ButtonStepProps } from "@aha.chat/flow-config"
import { createStore } from "zustand"

type UpdatedButtonData = {
  path: string
  data: ButtonStepProps | null
}

export type StepState = {
  activeFlowId: string | null

  buttonPath: string | null
  updatedButtonData: UpdatedButtonData | null
  openButtonEditorDialog: boolean

  openNodeDetailSheet: boolean
  organizationSetings: OrganizationSettings | null
}

export type StepStore = StepState & {
  setActiveFlowId: (activeFlowId: string | null) => void

  setOpenButtonEditorDialog: (open: boolean) => void
  setButtonPath: (buttonPath: string | null) => void
  setOpenNodeDetailSheet: (openNodeDetailSheet: boolean) => void
  setOrganizationSetings: (
    organizationSetings: OrganizationSettings | null,
  ) => void
  onChangeButtonData: (updatedButtonData: UpdatedButtonData | null) => void
}

export const createStepStore = (initState?: Partial<StepState>) => {
  const defaultProps = {
    buttonPath: null,
    updatedButtonData: null,
    openButtonEditorDialog: false,

    openNodeDetailSheet: false,
    organizationSetings: null,
    activeFlowId: null,
  }

  return createStore<StepStore>()((set) => ({
    ...defaultProps,
    ...initState,
    setOpenButtonEditorDialog: (openButtonEditorDialog) =>
      set({ openButtonEditorDialog }),
    setButtonPath: (buttonPath) => set({ buttonPath }),
    setOpenNodeDetailSheet: (openNodeDetailSheet) =>
      set({ openNodeDetailSheet }),
    setOrganizationSetings: (organizationSetings) =>
      set({ organizationSetings }),
    onChangeButtonData: (updatedButtonData: UpdatedButtonData | null) => {
      set({ updatedButtonData })
    },
    setActiveFlowId: (activeFlowId) => set({ activeFlowId }),
  }))
}
