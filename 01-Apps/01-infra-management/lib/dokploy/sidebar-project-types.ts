export type SidebarProject = {
  projectId: string;
  name: string;
  services: Array<{
    id: string;
    type: string;
    name: string;
    environmentId: string;
  }>;
};

export type SidebarProjectsPayload = {
  projects: SidebarProject[];
  updatedAt: number | null;
  refreshing: boolean;
  error: string;
};
