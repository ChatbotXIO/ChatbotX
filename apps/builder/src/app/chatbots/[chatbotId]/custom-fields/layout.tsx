import { ReactNode } from "react";

export default function CustomFieldsLayout({ children, folders, accountFields }: { children: ReactNode, folders: ReactNode, accountFields: ReactNode }) {
  return (
    <>
      {folders}
      {children}
      {accountFields}
    </>
  )
}
