
import { CreateFolderDialog } from "@/features/folders/create-folder-dialog";
import { ListFolders } from "@/features/folders/list-folders";
import { getCurrentFolder, getFolders } from "@/features/folders/queries";
import { getFoldersSearchParamsCache } from "@/features/folders/schemas/get-folders-schema";
import { T } from "@/tolgee/server";
import { Folder, FolderType } from "@ahachat.ai/database";
import { type SearchParams } from 'nuqs/server';
import { Suspense } from "react";

export default async function FoldersPage(props: {
  params: Promise<{ chatbotId: string }>,
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { folderId } = getFoldersSearchParamsCache.parse(searchParams)

  const folderType = FolderType.Flow

  const promises = Promise.all([
    folderId ? getCurrentFolder({
      id: folderId,
      chatbotId: params.chatbotId,
    }) : Promise.resolve({ folder: null, parents: [] as Folder[] }),
    getFolders({
      chatbotId: params.chatbotId,
      folderType: folderType,
      parentId: folderId,
    }),
  ])

  return (
    <>
      <div className="flex">
        <h3 className="font-bold flex-1">
          <T keyName="folders.header" />
        </h3>
        <CreateFolderDialog chatbotId={params.chatbotId} folderType={folderType} parentId={folderId} />
      </div>

      <Suspense>
        <ListFolders chatbotId={params.chatbotId}  folderType={folderType} promises={promises} />
      </Suspense>
    </>
  );
}

