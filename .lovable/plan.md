# Reverter Teleprompter para Web (PWA opcional)

Sem problemas — vamos remover toda a parte de Android nativo (Capacitor) e deixar o app rodando como aplicação **web pura**, acessível pelo navegador do celular ou computador. A funcionalidade continua a mesma: câmera frontal, teleprompter rolando, gravação de vídeo e armazenamento na nuvem.

---

## O que muda

- O app continua **100% funcional** no navegador (Chrome/Edge no Android, Safari no iPhone, navegador no desktop).
- A câmera frontal, gravação de vídeo (MediaRecorder), reconhecimento de voz e upload para a nuvem **funcionam normalmente no navegador moderno**.
- Você acessa o app pelo link de publicação do Lovable (ex.: `seu-app.lovable.app`) — sem precisar instalar nada, sem Android Studio, sem APK.
- Opcional: o usuário pode adicionar à tela inicial do celular ("Adicionar à tela de início") e ele abre como se fosse um app.

---

## O que será removido

1. **Arquivo `capacitor.config.ts`** — não é mais necessário.
2. **Dependências do Capacitor** no `package.json`:
   - `@capacitor/core`
   - `@capacitor/cli`
   - `@capacitor/android`
   - `@capacitor/camera`
   - `@capacitor/filesystem`
   - `@capacitor/share` (se houver)
3. **Pasta `android/`** se existir (gerada pelo `npx cap add android`).
4. **Qualquer import de `@capacitor/*`** no código (provavelmente em `Record.tsx`) — substituído pelas APIs nativas do navegador, que já estavam sendo usadas como base (`getUserMedia`, `MediaRecorder`, `webkitSpeechRecognition`).

---

## O que será mantido / ajustado

1. **Tela de gravação (`Record.tsx`)** — continua usando:
   - `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true })` para a câmera frontal.
   - `MediaRecorder` para gravar o vídeo.
   - `webkitSpeechRecognition` para o modo voz.
   - Upload do blob direto para o Supabase Storage.
2. **Download do vídeo** — em vez de salvar na galeria via Capacitor Filesystem, usa o padrão web: cria um link `<a download>` com o blob ou com a signed URL da nuvem. O navegador baixa para a pasta de Downloads do dispositivo.
3. **Compartilhar** — usa a **Web Share API** (`navigator.share`) quando disponível (funciona em celular). Caso contrário, mostra a signed URL para copiar.
4. **Backend (Lovable Cloud)** — **não muda nada**. Auth, banco, storage e RLS continuam exatamente como estão.
5. **Todas as outras telas** (Library, ScriptEditor, SettingsPage, Auth) — sem alteração.

---

## Como você vai usar o app depois

1. Eu publico o app pelo botão **Publish** no topo do Lovable.
2. Você recebe um link tipo `teleprompter.lovable.app`.
3. No celular Android: abre esse link no **Chrome**, dá permissão de câmera e microfone na primeira vez, e usa normalmente.
4. Para deixar parecendo um app: no Chrome, menu (⋮) → **"Adicionar à tela inicial"**. Cria um ícone na home que abre direto o teleprompter em tela cheia.
5. No iPhone: mesmo processo no Safari → botão compartilhar → "Adicionar à Tela de Início".

---

## Observações técnicas importantes

- **Câmera no navegador exige HTTPS** — o Lovable já serve em HTTPS, então funciona.
- **MediaRecorder no Safari iOS** tem suporte mais limitado; gravações longas podem ter limites. Funciona bem em Chrome Android, Edge e desktop.
- **Reconhecimento de voz (`webkitSpeechRecognition`)** funciona em Chrome (Android e desktop) e Edge. **Não funciona em Safari/iOS** — nesse caso, o usuário usa apenas o modo manual (PPM). Vou deixar a UI esconder a opção de voz quando o navegador não suportar.
- **Sem PWA com service worker** por padrão (evita problemas de cache no preview do Lovable). Apenas um `manifest.json` simples para permitir "Adicionar à tela inicial" com ícone e tela cheia — sem funcionamento offline.

---

## Passos da execução

1. Remover `capacitor.config.ts`.
2. Desinstalar pacotes `@capacitor/*` do `package.json`.
3. Limpar imports de Capacitor em `Record.tsx` e qualquer outro arquivo.
4. Substituir o "salvar na galeria" pelo download via link do navegador.
5. Adicionar `public/manifest.json` simples + meta tags no `index.html` para tornar instalável (sem service worker).
6. Ajustar `Record.tsx` para esconder o modo voz se `webkitSpeechRecognition` não existir.
7. Testar no preview: gravação, upload, download e compartilhamento.

Depois disso, é só clicar em **Publish** e usar o link no celular. Sem Android Studio, sem compilação, sem APK.
