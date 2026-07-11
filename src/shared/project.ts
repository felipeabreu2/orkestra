// Fase 15 (Task 2): tipos de projeto — cada projeto tem seu próprio canvas persistido em
// `projects/<id>.json` sob o baseDir (userData). O índice (`projects.json`) guarda a lista de
// projetos + qual está ativo; `persistence:load/save` (registerPersistenceIpc) opera sempre
// sobre o projeto ativo, delegando ao ProjectManager.
export interface Project {
  id: string
  name: string
  // Fase 17 (Task 1): pasta (diretório) vinculada ao projeto. Opcional — projetos sem cwd
  // seguem abrindo terminais no HOME (fallback já existente em PtyManager.spawn). Resolvido
  // late-bound no spawn via ProjectManager.getActive(), não gravado em nenhum outro lugar.
  cwd?: string
}

export interface ProjectIndex {
  projects: Project[]
  activeId: string
}
