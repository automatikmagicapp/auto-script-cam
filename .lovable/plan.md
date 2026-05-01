
# Música de fundo nos roteiros

## O que você vai ter

Em cada roteiro você poderá **anexar um arquivo MP3** (escolhido do seu computador/celular). A música fica salva junto com o roteiro. Na tela do editor você define:

- Se a música **começa tocando automaticamente** ao iniciar a gravação (sim/não)
- O **volume inicial** (0–100%)
- **Auto-fade in** ao iniciar e **fade out** ao parar (opcional)
- **Loop** (recomeça ao terminar)
- Ponto de início ("começar aos X segundos") — útil pra pular intro

Durante a gravação, um **mini-player flutuante** (canto da tela, igual ao painel de velocidade já existente) com:

- ▶ Play / ⏸ Pause
- ⏮ Voltar 10s / ⏭ Avançar 10s
- Slider de **posição** (timeline) — arrastar pra qualquer momento
- Slider de **volume** ao vivo
- Botão **mute** rápido
- Tempo atual / duração total

## Funções extras que recomendo (essenciais)

1. **Mixagem no vídeo final**: a música toca no celular durante a gravação, mas o microfone do vídeo só capta sua voz. Vou misturar a música **dentro do arquivo de vídeo gravado** (usando Web Audio API + MediaRecorder) para que ao reproduzir/baixar a gravação a música apareça junto, sincronizada com seus controles.
2. **Ducking automático** (opcional, ligado por padrão): quando o reconhecimento de voz detectar que você está falando, a música abaixa automaticamente ~50% e volta ao normal nas pausas. Deixa a fala sempre clara.
3. **Pré-visualização no editor**: um mini-player no editor de roteiro pra você ouvir a música antes de gravar e ajustar volume inicial com referência real.
4. **Substituir/remover** o MP3 a qualquer momento.
5. **Aviso de tamanho**: limite de 15 MB por música (suficiente pra ~15 min em qualidade boa) pra não pesar no upload.

## Como vai ficar (telas)

```text
┌─ Editor de Roteiro ──────────────────────┐
│ Título: [____________________]           │
│ Texto:  [_____________________________]  │
│         [_____________________________]  │
│                                          │
│ ── 🎵 Música de fundo ──────────────     │
│ [+ Adicionar MP3]   ou   nome.mp3  [x]  │
│ ▶ ━━━●━━━━━━━━━ 0:42 / 3:15  🔊━●━━     │
│ ☑ Tocar automaticamente ao gravar       │
│ ☑ Loop    ☑ Ducking (abaixa na fala)    │
│ Volume inicial:  ━━━●━━━ 60%             │
│ Começar aos: [0] segundos                │
│ ── Fade in: 2s   Fade out: 2s ──         │
│                                          │
│ [Gravar agora]                           │
└──────────────────────────────────────────┘
```

Durante a gravação (canto inferior direito):

```text
┌─ 🎵 música.mp3 ─────────┐
│ ▶  ⏮10  ⏭10   🔊 ━●━   │
│ ━━━━●━━━━━━ 1:23/3:15  │
└─────────────────────────┘
```

## Detalhes técnicos

### Banco de dados
- Nova coluna em `scripts`: `music_path` (texto, caminho no storage), `music_filename` (texto), `music_autoplay` (bool, default false), `music_volume` (numérico 0–1, default 0.6), `music_loop` (bool, default true), `music_start_seconds` (int, default 0), `music_ducking` (bool, default true), `music_fade_in` (int, default 2), `music_fade_out` (int, default 2)
- Novo bucket de storage **privado** `script-music` com políticas RLS por `user_id` (igual ao bucket `recordings`)
- Migração inclui: add columns, criar bucket, policies de SELECT/INSERT/UPDATE/DELETE só para o dono

### Upload
- Em `ScriptEditor.tsx`: input `<input type="file" accept="audio/mpeg,audio/mp3">`, valida tamanho ≤ 15 MB, faz upload pra `script-music/{user_id}/{script_id}.mp3`, salva caminho em `scripts.music_path`
- Botão remover: deleta do storage e limpa colunas

### Player no editor
- Componente `<MusicPanel>` reutilizável: gera signed URL, monta `<audio>` HTML5 nativo, controles básicos
- Salva mudanças de configuração (autoplay/volume/loop/etc) com debounce na tabela `scripts`

### Player na gravação (`Record.tsx`)
- Carrega música via signed URL no `beginRecording()`
- Cria `AudioContext` + `MediaElementAudioSourceNode` do `<audio>` + `GainNode` (controle de volume) + `MediaStreamDestination`
- Mistura: pega `streamRef.current` (vídeo+mic) + saída do `MediaStreamDestination` (música) num único stream usando `new MediaStream([...videoTracks, ...micTracks, ...musicTracks])` — na prática combina mic + música num único `AudioContext` antes de gravar
- `MediaRecorder` grava o stream combinado → música fica embutida no `.webm` final
- Ducking: hook no `recognitionRef.onresult`, quando há fala recente, baixa `gainNode.gain` para 0.5×; depois de 800 ms sem fala volta pro volume cheio (rampa suave com `setTargetAtTime`)
- Mini-painel flutuante: estado local `musicTime`, `musicVolume`, `musicPlaying`; botões manipulam o `<audio>` element diretamente

### Compatibilidade
- iOS Safari exige interação do usuário pra `AudioContext.resume()` — já temos o clique em "Iniciar gravação", então OK
- Se o navegador não suportar Web Audio API (raro), música toca em paralelo mas não fica embutida no vídeo (mostra aviso)

## Arquivos afetados

- `supabase/migrations/...sql` (novo) — colunas em `scripts`, bucket `script-music`, RLS
- `src/pages/ScriptEditor.tsx` — UI de upload e configuração da música
- `src/pages/Record.tsx` — carregar música, mixar no MediaRecorder, mini-player flutuante, ducking
- `src/components/MusicPanel.tsx` (novo) — componente reutilizável do player
- `src/integrations/supabase/types.ts` — atualizado automaticamente pela migração

## O que NÃO muda

- Reconhecimento de voz, velocidade, fluxo geral de gravação
- Gravações antigas continuam funcionando normalmente (música é opcional)
- Layout do app

Após sua aprovação, implemento tudo de uma vez.
