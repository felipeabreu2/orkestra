# Build & Release

Como compilar, empacotar e publicar o Orkestra (macOS/Windows/Linux).

## Scripts

- **`npm run build`** — `electron-vite build`: compila main/preload/renderer + a CLI `orq` para `out/`. Só o código compilado, sem instalável.
- **`npm run package`** — compila e empacota um **app desempacotado** em `dist/<plataforma>` (`electron-builder --dir`). Rápido, bom para testar localmente que o pacote abre e que o `node-pty` nativo foi reconstruído (`npmRebuild: true`). **Não** gera instaladores.
- **`npm run dist`** — compila e gera os **instaladores** da plataforma atual (`electron-builder`, sem `--dir`) em `dist/`. Não publica.
- **`npm run release`** — compila e **publica** os instaladores no GitHub Releases (`electron-builder --publish always`). Exige `GH_TOKEN` e `publish.owner`/`repository` reais (ver abaixo).

```bash
npm run dist            # instaladores locais da plataforma atual
npx electron-builder --mac      # força macOS
npx electron-builder --win      # força Windows
npx electron-builder --linux    # força Linux
```

> Builds macOS só saem de um macOS; a forma confiável de gerar as três plataformas de uma vez é o CI (abaixo).

## Targets configurados

Em [`../electron-builder.yml`](../electron-builder.yml):

| Plataforma | Targets |
|---|---|
| macOS | `dmg`, `zip` (arch `x64`, roda em Apple Silicon via Rosetta 2) |
| Windows | `nsis` |
| Linux | `AppImage`, `deb` |

`appId` = `app.orkestra.desktop` — **revise antes da primeira release**: é o identificador do app/updater e é doloroso trocar depois de ter usuários instalados.

## Já configurado na v1.0.0

- **Ícone** ✅ — `build/icon.png` (1024×1024, exportado de [`resources/icon.svg`](../resources/icon.svg)); o electron-builder deriva `.icns`/`.ico`. Para regenerar após editar o SVG, no macOS:
  ```bash
  qlmanage -t -s 1024 -o build/ resources/icon.svg && sips -z 1024 1024 build/icon.svg.png --out build/icon.png && rm build/icon.svg.png
  ```
- **Preparo de assinatura macOS** ✅ — `hardenedRuntime: true` + `build/entitlements.mac.plist` (JIT do V8 + carregamento do node-pty nativo). Ativa quando as variáveis de ambiente de assinatura existem.
- **Script `release`** ✅ e **workflow de release** ✅ (`.github/workflows/release.yml`) — matrix de 3 SOs que empacota e publica ao empurrar uma tag `v*`.
- **CI** ✅ — `.github/workflows/ci.yml` já roda em matrix `[ubuntu, macos, windows]` (Node 20): lint → typecheck → test → build (compila em todas). Não empacota (isso é o `release.yml`).
- `node-pty` (nativo) empacota corretamente via smartUnpack do electron-builder; `electron-updater` cabeado em `src/main/updater.ts` (só em app empacotado).

## O que só VOCÊ (mantenedor) pode fazer

### 1. Repositório GitHub + placeholders `TODO-USER`

Ainda não há `git remote`. Crie o repositório no GitHub e preencha os placeholders com o usuário/organização real:

- `electron-builder.yml` → `publish.owner` (o `electron-updater` embarcado usa isso para achar o feed de releases em produção).
- `package.json` → `repository.url` e `homepage`.
- `CHANGELOG.md` → o link `[1.0.0]` no rodapé.

```bash
git remote add origin https://github.com/<voce>/orkestra.git
git push -u origin main
```

### 2. Assinatura + notarização (macOS) — conta Apple Developer paga

Sem isso, o Gatekeeper avisa que o app "não pode ser verificado" e o auto-update (Squirrel.Mac) não funciona. Configure como secrets do repositório (Settings → Secrets and variables → Actions), ou como variáveis de ambiente para builds locais:

```bash
export CSC_LINK=/caminho/certificado.p12       # assinar
export CSC_KEY_PASSWORD=senha-do-certificado
export APPLE_ID=seu-apple-id@exemplo.com        # notarizar
export APPLE_APP_SPECIFIC_PASSWORD=senha-de-app
export APPLE_TEAM_ID=SEU_TEAM_ID
```

O electron-builder detecta essas variáveis e assina/notariza automaticamente (o YAML já está pronto com `hardenedRuntime` + entitlements).

### 3. Publicar uma release

Com o remote e os placeholders resolvidos:

```bash
# 1. bump da versão em package.json (ex.: 1.0.0 -> 1.0.1) e atualize o CHANGELOG
# 2. commit, então:
git tag v1.0.1
git push origin v1.0.1     # dispara o workflow release.yml nos 3 SOs
```

O workflow usa o `GITHUB_TOKEN` automático (permissão de escrita em Releases já declarada). Para publicar de uma máquina local em vez do CI: `export GH_TOKEN=ghp_xxx && npm run release`.

---

**Resumo:** o app compila e empacota hoje (`npm run dist`), com ícone e workflow de release prontos. Falta só o que exige credenciais/decisões suas: o repositório GitHub remoto (+ placeholders `TODO-USER`) e, para uma release sem avisos do Gatekeeper, a conta Apple Developer para assinatura/notarização.
