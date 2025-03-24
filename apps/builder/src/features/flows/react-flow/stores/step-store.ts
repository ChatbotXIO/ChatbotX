import { createStore } from "zustand"

export type StepStore = {
  isOpenDialog: boolean
  setIsOpenDialog: (isOpen: boolean) => void

  buttonPath: string | null
  setButtonPath: (buttonPath: string | null) => void

  openNodeDetailSheet: boolean
  setOpenNodeDetailSheet: (openNodeDetailSheet: boolean) => void
}

export const createStepStore = () => {
  return createStore<StepStore>()((set) => ({
    isOpenDialog: false,
    setIsOpenDialog: (isOpenDialog) => set({ isOpenDialog }),

    buttonPath: null,
    setButtonPath: (buttonPath) => set({ buttonPath }),

    openNodeDetailSheet: false,
    setOpenNodeDetailSheet: (openNodeDetailSheet) =>
      set({ openNodeDetailSheet }),
  }))
}
