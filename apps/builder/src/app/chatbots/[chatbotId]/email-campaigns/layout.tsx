import { ReactNode } from "react";

export default function EmailCampaignsLayout({ children, folders }: { children: ReactNode, folders: ReactNode }) {
  return (
    <>
      {folders}
      {children}
    </>
  )
}
