import { Suspense } from 'react';

import { FolderGroup } from "@prisma/client";
import { getFolders } from "@/features/folders/list/get-folders-queries";
import { getFoldersSearchParamsCache } from "@/features/folders/list/get-folders-schema";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { ListFolder } from "@/features/folders/list/list-folder";

export default async function FolderPage(
  props: { params: Promise<{ chatbotId: string }> }
) {
  const params = await props.params
  const search = getFoldersSearchParamsCache.parse({
    chatbotId: params.chatbotId,
    group: FolderGroup.TAG
  })

  const promises = getFolders(search)

  return (
    <div>
      <Suspense fallback={
        <DataTableSkeleton
          columnCount={6}
          searchableColumnCount={1}
          filterableColumnCount={2}
          cellWidths={["10rem", "40rem", "12rem", "12rem", "8rem", "8rem"]}
          shrinkZero
        />
      }>
        <ListFolder promises={promises} chatbotId={params.chatbotId}/>
      </Suspense>
    </div>
  )
}
