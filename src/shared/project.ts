// Fase 15 (Task 2): tipos de projeto — cada projeto tem seu próprio canvas persistido em
// `projects/<id>.json` sob o baseDir (userData). O índice (`projects.json`) guarda a lista de
// projetos + qual está ativo; `persistence:load/save` (registerPersistenceIpc) opera sempre
// sobre o projeto ativo, delegando ao ProjectManager.
export interface Project {
  id: string
  name: string
}

export interface ProjectIndex {
  projects: Project[]
  activeId: string
}
