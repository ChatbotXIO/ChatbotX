import type { OrganizationSettings } from "@aha.chat/database/types"
import { createStore } from "zustand"

export type StepState = {
  isOpenDialog: boolean
  buttonPath: string | null
  openNodeDetailSheet: boolean
  organizationSetings: OrganizationSettings | null
}

export type StepStore = StepState & {
  setIsOpenDialog: (isOpen: boolean) => void
  setButtonPath: (buttonPath: string | null) => void
  setOpenNodeDetailSheet: (openNodeDetailSheet: boolean) => void
  setOrganizationSetings: (
    organizationSetings: OrganizationSettings | null,
  ) => void
}

export const createStepStore = (initState?: Partial<StepState>) => {
  const defaultProps = {
    isOpenDialog: false,
    buttonPath: null,
    openNodeDetailSheet: false,
    organizationSetings: null,
  }

  return createStore<StepStore>()((set) => ({
    ...defaultProps,
    ...initState,
    setIsOpenDialog: (isOpenDialog) => set({ isOpenDialog }),
    setButtonPath: (buttonPath) => set({ buttonPath }),
    setOpenNodeDetailSheet: (openNodeDetailSheet) =>
      set({ openNodeDetailSheet }),
    setOrganizationSetings: (organizationSetings) =>
      set({ organizationSetings }),
  }))
}
