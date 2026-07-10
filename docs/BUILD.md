# Build & Release

Este guia cobre como compilar e empacotar o Orkestra, e o que falta para publicar uma release real (macOS/Windows/Linux).

## `npm run build` vs. `npm run package`

- **`npm run build`** — roda `electron-vite build`: compila main/preload/renderer (TypeScript + React) e a CLI `orq` para `out/`. Não gera nenhum instalável, só o código compilado.
- **`npm run package`** — roda `electron-vite build && electron-builder --dir`: compila e depois empacota um **app desempacotado** em `dist/<plataforma>` (ex.: `dist/mac/Orkestra.app`). É rápido e bom para testar localmente que o pacote abre e que o `node-pty` nativo foi reconstruído corretamente para o Electron (`npmRebuild: true` no `electron-builder.yml` cuida disso). A flag `--dir`, porém, **não gera instaladores** (`.dmg`, `.exe`, `.AppImage`...) — só o app "cru".

Para gerar os instaladores de verdade (os targets configurados em `electron-builder.yml`), rode o electron-builder sem `--dir`:

```bash
npm run build
npx electron-builder            # build para a plataforma atual
npx electron-builder --mac      # força macOS
npx electron-builder --win      # força Windows
npx electron-builder --linux    # força Linux
```

> Cross-building tem limites do próprio electron-builder/SO — builds macOS só saem de um macOS. Ver a seção CI abaixo para a forma confiável de gerar todas as plataformas a partir deste repo (que hoje só roda em macOS Intel localmente).

## Targets configurados

Definidos em [`../electron-builder.yml`](../electron-builder.yml):

| Plataforma | Targets |
|---|---|
| macOS | `dmg`, `zip` (arch `x64`, categoria `public.app-category.developer-tools`) |
| Windows | `nsis` |
| Linux | `AppImage`, `deb` (categoria `Development`) |

`appId` está definido como `app.orkestra.desktop` — **vale revisar antes de uma release real** (foge um pouco do padrão reverse-DNS mais comum, ex. `com.<autor>.orkestra`; funciona como está, mas é o tipo de coisa dolorosa de trocar depois de já ter usuários instalados, porque muda o identificador do app/updater).

## O que já está configurado vs. o que falta

`electron-builder.yml` e `package.json` já têm a infraestrutura pronta: targets acima, `npmRebuild: true`, metadata básica, e `electron-updater` cabeado em `src/main/updater.ts` (só age em build empacotado — `app.isPackaged` — e falha em silêncio se não houver feed configurado). O que falta são **recursos que só o mantenedor pode fornecer**:

### (a) Ícone do app

`electron-builder.yml` aponta `icon: build/icon.png`, mas o arquivo **ainda não existe neste repo** — é um item previsto para a Fase 13 (identidade visual). Até lá, o empacotamento cai no ícone default do Electron (não falha, só fica genérico). Para resolver: colocar um PNG **1024×1024** em `build/icon.png` — o electron-builder deriva o `.icns` (mac) e `.ico` (win) a partir dele automaticamente.

### (b) Assinatura e notarização (macOS)

Sem assinatura, o Gatekeeper do macOS avisa que o app "não pode ser verificado", e sem notarização o auto-update (Squirrel.Mac) não funciona de verdade. Para assinar, exporte antes de empacotar:

```bash
export CSC_LINK=/caminho/para/certificado.p12
export CSC_KEY_PASSWORD=senha-do-certificado
```

Para notarizar (necessário para distribuir fora da App Store sem avisos do Gatekeeper):

```bash
export APPLE_ID=seu-apple-id@exemplo.com
export APPLE_APP_SPECIFIC_PASSWORD=senha-de-app-especifica
export APPLE_TEAM_ID=SEU_TEAM_ID
```

O electron-builder detecta essas variáveis de ambiente automaticamente e assina/notariza como parte do build — não é preciso configuração adicional no YAML. Exige uma conta Apple Developer paga.

### (c) `publish.owner` e `repository`

Dois placeholders `TODO-USER` precisam do usuário/organização real do GitHub antes de qualquer release:

- `electron-builder.yml` → `publish.owner` (é o que o `electron-updater`, embarcado no app, usa para achar o feed de releases em produção).
- `package.json` → `repository.url` e `homepage`.

### (d) Publicar uma release (GitHub Releases)

Com `publish.owner`/`repository` preenchidos e um repositório remoto real, publicar exige um `GH_TOKEN` (token do GitHub com permissão de escrita em Releases) e rodar o electron-builder **sem** `--dir`:

```bash
export GH_TOKEN=ghp_xxx
npm run build
npx electron-builder --publish always
```

> Atenção: `npm run package` (o script já existente) usa `--dir`, que não produz um artefato publicável — não combine `--publish` com ele. Se for repetir esse fluxo com frequência, vale adicionar um script dedicado ao `package.json` (ex. `"release": "electron-vite build && electron-builder --publish always"`) — não incluído aqui porque é uma mudança de código, fora do escopo desta documentação.

### (e) CI para builds Windows/Linux

O workflow atual (`.github/workflows/ci.yml`) roda só em `macos-latest` e cobre lint/typecheck/test — **não empacota nada**. A partir de um macOS Intel local só sai o build mac; Windows e Linux exigem CI (ou máquinas próprias dessas plataformas). Para builds cross-platform de verdade, configure uma matrix de GitHub Actions (`macos-latest`, `windows-latest`, `ubuntu-latest`) rodando `npm run build` + `electron-builder` (ou o script `release` sugerido acima) em cada runner, com os secrets de assinatura/notarização/`GH_TOKEN` configurados no repositório (Settings → Secrets).

---

**Resumo:** o app compila e empacota localmente hoje (`npm run build`; `npm run package` para um teste rápido desempacotado; `electron-builder` direto para instaladores reais). Uma release pública de verdade — assinada, notarizada, publicada, multi-plataforma — depende dos itens (a)-(e) acima, todos recursos/credenciais que só o mantenedor pode configurar.
