import { ReactNode } from "react";

export default function AutomatedResponesLayout({ children, folders }: { children: ReactNode, folders: ReactNode }) {
  return (
    <>
      {folders}
      {children}
    </>
  )
}
