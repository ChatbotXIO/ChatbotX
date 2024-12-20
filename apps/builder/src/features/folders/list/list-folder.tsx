"use client"

import * as React from 'react';

import { getFolders } from "@/features/folders/list/get-folders-queries";
import { CreateFolderDialog } from "@/features/folders/create/create-folder-dialog";
import { FolderGroup } from "@prisma/client";
import {
  Plus,
  Folder as FolderIcon,
  FolderOpenIcon,
  EllipsisVertical,
  Type,
  Trash
} from "lucide-react";
import { useTranslate } from "@tolgee/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider
} from "@/components/ui/sidebar";
import { TreeDataItem, TreeView } from "@/components/ui/tree-view";
import { Folder } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { EditFolderDialog } from "@/features/folders/edit/edit-folder-dialog";
import { DeleteFolderDialog } from "@/features/folders/delete/delete-folder-dialog";

interface FolderSidebarProps {
  promises: Promise<Awaited<ReturnType<typeof getFolders>>>,
  chatbotId: string
}

export function ListFolder({ promises, chatbotId }: FolderSidebarProps) {
  const { data: folders } = React.use(promises)
  const router = useRouter()

  console.log('folders', folders)

  const { t } = useTranslate()
  const buildTreeData = (folders: Folder[]) => {
    const map: { [index: string]: any } = {};
    const roots: TreeDataItem[] = [];

    folders.forEach(folder => {
      map[folder.id] = {
        id: folder.id,
        name: folder.name,
        icon: FolderIcon,
        selectedIcon: FolderOpenIcon,
        actions: <FolderAction folder={folder}/>,
        children: [],
        onClick: () => selectFolder(folder)
      };
    });

    folders.forEach(folder => {
      if (folder.parentId) {
        map[folder.parentId].children.push(map[folder.id]);
      } else {
        roots.push(map[folder.id]);
      }
    });

    return roots;
  }

  const selectFolder = (folder: Folder) => {
    router.replace(`/chatbots/${chatbotId}/tags?folderId=${folder.id}`)
  }

  const treeDataItems: TreeDataItem[] = buildTreeData(folders)

  return (
    <Sidebar collapsible="none" className="hidden md:flex h-full">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex w-full justify-between items-center">
              <div>{t('common.folders')}</div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CreateFolderDialog chatbotId={chatbotId} group={FolderGroup.TAG}>
                      <Plus size={16} className={"cursor-pointer"}></Plus>
                    </CreateFolderDialog>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('common.edit')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <FolderIcon/> All folders
                </SidebarMenuButton>
                {/*<SidebarMenuBadge></SidebarMenuBadge>*/}
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <FolderIcon/> Uncategorized
                </SidebarMenuButton>
                {/*<SidebarMenuBadge></SidebarMenuBadge>*/}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t('common.folders')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <TreeView data={treeDataItems}></TreeView>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

function FolderAction({ folder }: { folder: Folder }) {
  const { t } = useTranslate()

  return (
    <div className="flex gap-2 items-center">
      <CreateFolderDialog chatbotId={folder.chatbotId} group={FolderGroup.TAG} parentId={folder.id}>
        <Plus size={14}></Plus>
      </CreateFolderDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <EllipsisVertical size={14}/>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <EditFolderDialog chatbotId={folder.chatbotId} folder={folder}>
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