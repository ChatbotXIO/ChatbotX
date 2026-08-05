import type { ButtonStepProps, ButtonType } from "@chatbotx.io/flow-config"
import { createStore } from "zustand"

type UpdatedButtonData = {
  path: string
  data: ButtonStepProps | null
}

export type ButtonEditorConfig = {
  lockLabel?: boolean
  hiddenButtonTypes?: ButtonType[]
  hideDelete?: boolean
}

export type StepState = {
  activeFlowId: string | null

  buttonPath: string | null
  buttonInitialData: ButtonStepProps | null
  updatedButtonData: UpdatedButtonData | null
  openButtonEditorDialog: boolean

  openNodeDetailSheet: boolean

  buttonEditorConfig: ButtonEditorConfig | null
}

export type StepStore = StepState & {
  setActiveFlowId: (activeFlowId: string | null) => void

  setOpenButtonEditorDialog: (open: boolean) => void
  setButtonPath: (buttonPath: string | null) => void
  setButtonInitialData: (buttonInitialData: ButtonStepProps | null) => void
  setOpenNodeDetailSheet: (openNodeDetailSheet: boolean) => void
  onChangeButtonData: (updatedButtonData: UpdatedButtonData | null) => void
  setButtonEditorConfig: (config: ButtonEditorConfig | null) => void
}

export const createStepStore = (initState?: Partial<StepState>) => {
  const defaultProps = {
    buttonPath: null,
    buttonInitialData: null,
    updatedButtonData: null,
    openButtonEditorDialog: false,

    openNodeDetailSheet: false,
    activeFlowId: null,

    buttonEditorConfig: null,
  }

  return createStore<StepStore>()((set) => ({
    ...defaultProps,
    ...initState,
    setOpenButtonEditorDialog: (openButtonEditorDialog) =>
      set({ openButtonEditorDialog }),
    setButtonPath: (buttonPath) => set({ buttonPath }),
    setButtonInitialData: (buttonInitialData) => set({ buttonInitialData }),
    setOpenNodeDetailSheet: (openNodeDetailSheet) =>
      set({ openNodeDetailSheet }),
    onChangeButtonData: (updatedButtonData: UpdatedButtonData | null) => {
      set({ updatedButtonData })
    },
    setActiveFlowId: (activeFlowId) => set({ activeFlowId }),
    setButtonEditorConfig: (buttonEditorConfig) => set({ buttonEditorConfig }),
  }))
}
