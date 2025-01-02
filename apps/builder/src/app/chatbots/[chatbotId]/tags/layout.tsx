import { ReactNode } from "react";

export default function TagsLayout({ children, folders }: { children: ReactNode, folders: ReactNode }) {
  return (
    <>
      {folders}
      {children}
    </>
  )
}
