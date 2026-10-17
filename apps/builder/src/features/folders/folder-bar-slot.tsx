"use client"

import { createContext, type ReactNode, useContext } from "react"

// `WithFolderBar` hands the server-loaded folder bar down through this context
// so a client table decides where it sits inside its card. A parallel-route
// slot cannot be used here: rendered below its own segment it never resolves
// and suspends the whole table.
const FolderBarSlotContext = createContext<ReactNode>(null)

const FolderBarSlotProvider = ({
  slot,
  children,
}: {
  slot: ReactNode
  children: ReactNode
}) => (
  <FolderBarSlotContext.Provider value={slot}>
    {children}
  </FolderBarSlotContext.Provider>
)

const FolderBarSlot = () => useContext(FolderBarSlotContext)

export { FolderBarSlot, FolderBarSlotProvider }
