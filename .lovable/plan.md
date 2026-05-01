## Verificação de viabilidade — todos os 5 itens

Após inspecionar `src/pages/Record.tsx` (815 linhas), `src/components/MusicPanel.tsx` e o schema do banco, **4 dos 5 itens já estão totalmente implementados** e **1 precisa de pequeno ajuste**. Não é uma reescrita — é uma checagem + 2 melhorias pontuais.

### Status item por item

| # | Pedido | Status atual | Ação |
|---|--------|--------------|------|
| 1 | Mini-player flutuante (play/pause, volume, mute) | ✅ Já existe (linhas 737–781 de Record.tsx) | Nenhuma |
| 2 | Ducking só durante fala, com retorno gradual | ⚠️ Existe mas precisa polimento | Ajustar |
| 3 | Botões ±10s no mini-player | ✅ Já existe (`SkipBack`/`SkipForward` chamando `nudgeMusic(±10)`) | Nenhuma |
| 4 | Persistir todas as configs de música no editor | ✅ Já existe (`MusicPanel.persist()` com debounce de 500ms grava todos os 9 campos) | Nenhuma |
| 5 | Baixar vídeo final com música mixada | ✅ Já existe (`downloadLocal()` na tela de review; `buildRecordingStream()` mixa música via Web Audio no MediaRecorder) | Melhorar UX |

### O que vou ajustar (mudanças pequenas)

**A. Refinar o ducking (item 2)** — `Record.tsx` linhas 358–374 e 228–235

Hoje o ducking funciona assim:
- Marca `lastSpeechRef` toda vez que o reconhecimento de voz emite resultado
- Um `setInterval` de 150ms checa: se passou <800ms desde a última fala → abaixa para 40% do volume; senão volta ao volume cheio

Problemas observados:
- Só funciona no modo "voz" (onde `recognitionRef` está ativo). No modo "manual" o ducking nunca dispara mesmo com a opção marcada.
- A volta ao normal usa `setTargetAtTime(..., 0.3)` — é gradual, mas só dispara quando o intervalo detecta a transição. Em fala intermitente (frases curtas) pode dar "pumping".

Ajustes:
1. **Sempre iniciar o reconhecimento de voz para ducking** (mesmo em modo manual), apenas para detectar atividade vocal — sem afetar o scroll. Criar uma instância separada e silenciosa quando `music_ducking` está ativo e o modo é manual.
2. **Tornar a rampa de retorno mais suave**: aumentar a constante de tempo de `0.3` para `0.6` ao voltar ao volume normal, e usar `0.08` ao abaixar (ataque rápido, release lento — padrão de áudio profissional).
3. **Aumentar o "hold time"** de 800ms para 1200ms para evitar oscilação em pausas curtas entre palavras.

**B. Melhorar UX do download (item 5)** — `Record.tsx` linhas 499–505 e 793–801

Hoje o botão "Baixar" funciona, mas:
- Está pequeno na grid, sem destaque visual
- O nome do arquivo usa `.webm` que muitos usuários não reconhecem

Ajustes:
1. Adicionar ícone `Download` (de lucide-react) em vez do `Upload` rotacionado
2. Adicionar texto explicativo logo abaixo: *"O vídeo baixado já inclui a música mixada"* — apenas se `music` existir
3. Dar destaque ao botão (variant `default` em vez de `outline`) quando há música, para incentivar download local

### Detalhes técnicos

**Arquivo afetado**: somente `src/pages/Record.tsx` (sem migração, sem novos componentes, sem mudança no `MusicPanel.tsx`).

**Linhas tocadas (~30 linhas no total)**:
- `startVoiceMode()` → extrair detecção de fala em helper `startSpeechDetection()` reutilizável
- Novo `useEffect` que inicia detecção silenciosa quando `phase === "recording" && music?.music_ducking && mode === "manual"`
- Ajustar constantes em `setMusicGain` dentro do `useEffect` de ducking (linhas 367, 370)
- Ajustar bloco do botão de download (linhas 793–801) e função `downloadLocal()`

**Riscos**: baixíssimos. Não toca em banco, storage, autenticação, gravação ou upload. Só refina lógica já existente.

### O que NÃO muda
- Schema do banco (todos os 9 campos `music_*` já existem em `scripts`)
- Bucket `script-music` (já criado, com RLS)
- Componente `MusicPanel.tsx` (persistência já está correta)
- Fluxo de gravação, mixagem e upload para nuvem

Após sua aprovação, faço as duas pequenas mudanças em `Record.tsx` em uma única edição.
