import React from "react";

export default async function FolderLayout({ children, folder }: {
  children: React.ReactNode,
  folder: React.ReactNode,
}) {
  return (
    <div className="flex flex-wrap gap-4 min-h-full">
      <div className="w-full lg:w-[16rem]">
        {folder}
      </div>
      <div className="w-full lg:flex-1 min-h-full">
        {children}
      </div>
    </div>
  )
}
