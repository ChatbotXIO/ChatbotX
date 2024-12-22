"use client"

import * as React from 'react';
import { useEffect } from 'react';

import { getFolders } from "@/features/folders/list/get-folders-queries";
import { CreateFolderDialog } from "@/features/folders/create/create-folder-dialog";
import { Folder, FolderGroup } from "@prisma/client";
import { EllipsisVertical, Folder as FolderIcon, FolderOpenIcon, Plus, Trash, Type } from "lucide-react";
import { useTranslate } from "@tolgee/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { TreeDataItem, TreeView } from "@/components/ui/tree-view";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { EditFolderDialog } from "@/features/folders/edit/edit-folder-dialog";
import { DeleteFolderDialog } from "@/features/folders/delete/delete-folder-dialog";
import { useQueryState } from "nuqs";
import { EditFolderSchema } from "@/features/folders/edit/edit-folder-schema";

interface FolderSidebarProps {
  promises: Promise<Awaited<ReturnType<typeof getFolders>>>,
  chatbotId: string,
  group: FolderGroup
}

export function ListFolder({ promises, chatbotId, group }: FolderSidebarProps) {
  const { data: folders } = React.use(promises)
  const [folderId, setFolderId] = useQueryState('folderId')
  const [treeItems, setTreeItems] = React.useState<TreeDataItem[]>([])

  const { t } = useTranslate()
  const buildTreeData = (folders: Folder[], parentId: string | null = null): TreeDataItem[] => {
    return folders
      .filter(folder => folder.parentId === parentId)
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        icon: FolderIcon,
        selectedIcon: FolderOpenIcon,
        actions: <FolderAction folder={folder} group={group} onUpdated={(item) => updateTreeData(folder.id, item)}/>,
        children: buildTreeData(folders, folder.id),
      }));
  }

  const updateTreeNode = (treeItems: TreeDataItem[], folderId: string, data: EditFolderSchema): TreeDataItem[] => {
    return treeItems.map((treeData) => {
      if (treeData.id === folderId) {
        const folder = folders.find(obj => obj.id === folderId) as Folder
        folder.name = data.name
        treeData.name = data.name

        return {
          ...treeData,
          actions: <FolderAction folder={folder} group={group} onUpdated={(item) => updateTreeData(folder.id, item)}/>,
        }
      }

      return { ...treeData, children: updateTreeNode(treeData.children, folderId, data) };
    })
  }

  const updateTreeData = (folderId: string, data: EditFolderSchema) => {
    setTreeItems((prevTreeItems) => {
      return updateTreeNode(prevTreeItems, folderId, data);
    });
  }

  useEffect(() => {
    if (folders) {
      const data = buildTreeData(folders);
      setTreeItems(data);
    }
  }, [folders]);

  return (
    <div>
      <div className="relative flex w-full min-w-0 flex-col p-2">
        <div
          className="flex justify-between items-center rounded-md p-2 text-xs font-medium text-sidebar-foreground/70">
          <div>{t('common.folders')}</div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <CreateFolderDialog chatbotId={chatbotId} group={group}>
                  <Plus size={16} className="cursor-pointer"></Plus>
                </CreateFolderDialog>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('common.edit')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="w-full text-sm">
          <ul className="flex w-full min-w-0 flex-col gap-1">
            <li className="group/menu-item relative">
              <SidebarMenuButton onClick={() => setFolderId("all")}>
                <FolderIcon/> All folders
              </SidebarMenuButton>
              {/*<SidebarMenuBadge></SidebarMenuBadge>*/}
            </li>
          </ul>
          <ul className="flex w-full min-w-0 flex-col gap-1">
            <li className="group/menu-item relative">
              <SidebarMenuButton onClick={() => setFolderId(null)}>
                <FolderIcon/> Uncategorized
              </SidebarMenuButton>
              {/*<SidebarMenuBadge></SidebarMenuBadge>*/}
            </li>
          </ul>
        </div>
      </div>
      <div className="relative flex w-full min-w-0 flex-col p-2">
        <div
          className="flex justify-between items-center rounded-md p-2 text-xs font-medium text-sidebar-foreground/70">
          {t('common.folders.list')}</div>
        <div className="w-full text-sm">
          <ul className="flex w-full min-w-0 flex-col gap-1">
            <li className="group/menu-item relative">
              <TreeView data={treeItems}
                        initialSelectedItemId={folderId as string | undefined}
                        onSelectChange={(item) => item && setFolderId(item.id)}></TreeView>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function FolderAction({
  folder, group, onUpdated
}: {
  folder: Folder,
  group: FolderGroup,
  onUpdated: (item: EditFolderSchema) => void
}) {
  const { t } = useTranslate()

  return (
    <div className="flex gap-2 items-center">
      <CreateFolderDialog chatbotId={folder.chatbotId} group={group} parentId={folder.id}>
        <Plus size={14}></Plus>
      </CreateFolderDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <EllipsisVertical size={14}/>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <EditFolderDialog chatbotId={folder.chatbotId} folder={folder} onUpdated={(item) => onUpdated(item)}>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="px-3 py-1">
              <div className="flex items-center gap-2">
                <Type size={14}/> {t('tags.edit_name')}
              </div>
            </DropdownMenuItem>
          </EditFolderDialog>
          <DropdownMenuSeparator/>
          <DeleteFolderDialog chatbotId={folder.chatbotId} folderId={folder.id}>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="px-3 py-1 text-destructive">
              <div className="flex items-center gap-2">
                <Trash size={14}/>{t('common.delete')}
              </div>
            </DropdownMenuItem>
          </DeleteFolderDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
