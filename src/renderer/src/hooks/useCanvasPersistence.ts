import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/canvasStore'

// Fix de corrupção cross-project (2026-07-14): TODA gravação daqui sai por id EXPLÍCITO
// (projects.saveCanvas(activeProjectId, …)), nunca mais pelo canal "salva no projeto ativo do
// main" (persistence:save). O antigo caminho gravava no projeto que o MAIN considerasse ativo no
// momento da escrita — bastava main e renderer dessincronizarem (switch com canvas ilegível,
// segunda instância do app) para o autosave copiar o canvas de um projeto por cima do arquivo de
// outro. Com o id vindo do próprio store (setado atomicamente com o conteúdo pelo hydrate), o
// snapshot serializado e o arquivo de destino são sempre do MESMO projeto, em qualquer
// interleaving. Sem id conhecido (boot antes do load, shape legado sem projetos) o autosave fica
// desligado — não salvar é sempre mais seguro que salvar no lugar errado.
function saveByProjectId(): void {
  const s = useCanvasStore.getState()
  if (!s.activeProjectId) return
  void window.orkestra.projects.saveCanvas(s.activeProjectId, s.serialize())
}

export function useCanvasPersistence(): void {
  const hydrate = useCanvasStore((s) => s.hydrate)
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const loaded = useRef(false)

  // Carrega o layout salvo uma vez, no mount — snapshot + id do projeto dono num único
  // round-trip atômico (ver registerPersistenceIpc). Snapshot ausente (projeto novo/arquivo
  // ilegível) ainda registra o dono, senão o autosave ficaria desligado até a primeira troca.
  useEffect(() => {
    let cancelled = false
    window.orkestra.persistence.load().then(({ projectId, snapshot }) => {
      if (cancelled) return
      if (snapshot) hydrate(snapshot, projectId)
      else useCanvasStore.getState().setActiveProjectId(projectId)
      loaded.current = true
    }).catch(() => {
      if (!cancelled) loaded.current = true
    })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  // Autosave debounced quando os nós mudam (só depois do load inicial).
  useEffect(() => {
    if (!loaded.current) return
    const t = setTimeout(() => {
      // Guarda contra a troca de projeto em voo (Fase 15 Task 3): com o save por id, um timer
      // atrasado já não consegue gravar no projeto errado (id e conteúdo saem juntos do store) —
      // este skip evita apenas uma gravação redundante no meio do flush→switch→hydrate.
      if (useCanvasStore.getState().switching) return
      saveByProjectId()
    }, 500)
    return () => clearTimeout(t)
  }, [nodes, edges])

  // Flush síncrono do último layout ao fechar o app (evita perder mudança <500ms antes do quit).
  // Também por id: mesmo que o quit pegue uma troca de projeto no meio, o conteúdo em memória e o
  // arquivo de destino pertencem ao mesmo projeto.
  useEffect(() => {
    const flush = (): void => {
      if (loaded.current) saveByProjectId()
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])
}
