## Objetivo

Transformar o projeto em **Android-only**: nenhuma versão web utilizável, todas as funcionalidades preservadas dentro do APK. Preview do Lovable continua funcionando para você editar.

## Estratégia

Detectar em runtime se o app está rodando dentro do Capacitor (APK) ou no browser. Se estiver no browser **e não for o preview do Lovable**, mostrar uma tela bloqueio "Disponível apenas no app Android" em vez do app real.

```text
┌─────────────────────────────────────────────────┐
│ Origem do acesso       │ O que o usuário vê    │
├─────────────────────────────────────────────────┤
│ APK Android (Capacitor)│ App completo          │
│ Preview Lovable        │ App completo (edição) │
│ autoteleprompter...app │ Tela "Baixe o APK"    │
│ Qualquer outro browser │ Tela "Baixe o APK"    │
└─────────────────────────────────────────────────┘
```

## Mudanças

### 1. Gate de plataforma (novo componente)
Criar `src/components/PlatformGate.tsx` que:
- Importa `Capacitor` de `@capacitor/core` e checa `Capacitor.isNativePlatform()`.
- Verifica se o hostname contém `lovableproject.com` ou `id-preview--` (preview do Lovable).
- Se nenhum dos dois → renderiza tela de bloqueio.
- Se sim → renderiza `children` (o app normal).

Tela de bloqueio: ícone do app, título "Autoteleprompter", mensagem "Este aplicativo está disponível apenas como app Android", e um botão "Baixar APK" (link para a release do GitHub — você me passa depois ou deixo placeholder).

### 2. Envolver o App
Em `src/App.tsx`, envolver `<BrowserRouter>` com `<PlatformGate>`.

### 3. Remover SEO / metadados web do `index.html`
- Remover meta tags Open Graph (`og:*`) e Twitter (`twitter:*`).
- Remover `<meta name="description">` e `<meta name="author">`.
- Trocar `<title>` para algo neutro tipo "Autoteleprompter".
- Manter apenas: charset, viewport, theme-color, favicon, root div, scripts.

### 4. Remover suporte PWA / instalável via web
- Deletar `public/manifest.json`.
- Remover do `index.html`: `<link rel="manifest">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`.
- Resultado: navegadores não oferecem mais "Adicionar à tela inicial" pela web.

### 5. Bloquear indexação por buscadores
Atualizar `public/robots.txt`:
```
User-agent: *
Disallow: /
```

### 6. Despublicar o site Lovable
Tornar o publish privado via `update_visibility('private')`. Quem acessar `autoteleprompter.lovable.app` recebe tela de login Lovable, não o app. Combinado com o gate (passo 1), há dupla proteção.

### 7. Preservar build do APK
Nenhuma mudança no GitHub Actions nem no `capacitor.config.ts`. O fluxo atual continua: workflow → `dist/` → APK. O `PlatformGate` deixa passar porque `Capacitor.isNativePlatform()` retorna `true` dentro do APK.

## O que NÃO muda

- Todas as páginas (`Library`, `ScriptEditor`, `Record`, `SettingsPage`, `Auth`) ficam intactas.
- Auth, banco, gravação, teleprompter — tudo igual.
- Preview do Lovable continua funcional para edição.
- Workflow de build do APK continua igual.

## Detalhes técnicos

- `Capacitor.isNativePlatform()` é a API oficial e retorna `true` em iOS/Android nativo, `false` no web.
- A checagem de hostname do preview usa `window.location.hostname.includes('lovableproject.com') || window.location.hostname.includes('id-preview--')`.
- `update_visibility('private')` requer plano Business/Enterprise. Se não tiver, o gate do passo 1 + robots.txt já bloqueiam acesso útil; pulamos o passo 6.

## Pergunta antes de implementar

Você tem URL de download do APK pronta (ex.: GitHub Releases) para o botão "Baixar APK" da tela de bloqueio? Se não, deixo um botão `disabled` com texto "Em breve" e você me passa depois.
