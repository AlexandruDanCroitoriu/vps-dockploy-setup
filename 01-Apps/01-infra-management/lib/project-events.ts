export const PROJECTS_CHANGED_EVENT = "dokploy-projects-changed";

export function notifyProjectsChanged() {
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}
