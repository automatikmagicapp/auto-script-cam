## Zoom da câmera com ângulo inicial amplo + controle ao vivo

Hoje a câmera é aberta com `getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 } })` (linha 158 de `Record.tsx`). O navegador escolhe o "campo de visão" padrão da webcam, que costuma ser fechado (parece um close-up). O `<video>` também usa `object-fit: cover`, o que recorta ainda mais.

Vou resolver em duas frentes: (1) abrir a câmera num ângulo mais amplo de fábrica, (2) adicionar um controle de zoom flutuante durante a gravação para o usuário ajustar ao vivo.

### O que muda

**1. Captura inicial mais ampla** — `initCamera()` em `Record.tsx`
- Pedir resolução maior (`1920x1080 ideal`) para ter mais "área" disponível antes de qualquer recorte.
- Tentar usar a constraint nativa `zoom: { ideal: 1.0 }` e `advanced: [{ zoom: minZoom }]` quando a câmera suportar (algumas webcams e a maioria das câmeras de celular expõem zoom óptico/digital via `MediaTrackCapabilities.zoom`).
- Trocar o `object-fit: cover` do `<video>` por `object-fit: contain` (ou `cover` apenas quando o usuário ampliar) para não cortar as bordas — o usuário verá tudo o que a câmera capta.

**2. Zoom nativo quando disponível** (ideal)
- Detectar `track.getCapabilities().zoom` após abrir o stream.
- Se existir → usar `track.applyConstraints({ advanced: [{ zoom: valor }] })` para zoom real (sem perda de qualidade). Funciona em Chrome/Edge com a maioria das câmeras modernas.

**3. Zoom CSS como fallback** (sempre disponível)
- Quando a câmera não suportar zoom nativo, aplicar `transform: scale(n)` no `<video>` com `transform-origin: center`.
- Range: **0.8x a 3x** (0.8x permite "afastar" visualmente além do default quando possível, útil em conjunto com `object-fit: contain`).
- Step: 0.1x.

**4. Mini-controle de zoom flutuante durante a gravação**
- Painel pequeno no canto superior direito do preview (mesmo padrão visual do mini-player de música).
- Conteúdo: ícone `ZoomOut` − slider − ícone `ZoomIn` + botão "Reset" (volta para 1.0x).
- Visível nas fases `preview` e `recording` (para o usuário enquadrar antes e ajustar durante).
- Mostra valor atual (ex: "1.4x") e badge "óptico" quando estiver usando zoom nativo da câmera.

**5. Persistência (opcional, leve)**
- Guardar último valor de zoom em `localStorage` (`teleprompter:lastZoom`) para reabrir a câmera no mesmo enquadramento da última sessão. Não toca no banco — é uma preferência local.

### Detalhes técnicos

**Arquivo único afetado**: `src/pages/Record.tsx` (~50 linhas adicionadas).

**Novos estados**:
- `zoom: number` (default 1.0)
- `zoomRange: { min: number; max: number; step: number; native: boolean }`

**Novos refs**:
- `videoTrackRef` para chamar `applyConstraints` sem reabrir o stream.

**Novo `useEffect`**: aplica zoom (nativo ou CSS) sempre que `zoom` muda.

**Helper `detectZoomCapabilities(track)`**: lê `getCapabilities()` e popula `zoomRange`. Se não houver zoom nativo, define `{ min: 0.8, max: 3, step: 0.1, native: false }` para CSS.

**UI**: novo bloco JSX dentro do container do `<video>`, `position: absolute; top: 8px; right: 8px`, fundo translúcido. Componentes `Button` (icon) + `Slider` já existentes no projeto.

### Riscos
Baixíssimos. Não toca em mixagem de áudio, gravação, banco, storage ou auth. O `MediaRecorder` continua gravando o stream original — o zoom CSS é puramente visual no preview, mas o **zoom nativo afeta o stream gravado** (o que é o comportamento desejado quando disponível). Para zoom CSS, posso opcionalmente aplicar o mesmo `transform` no canvas de gravação se você quiser que o vídeo final reflita o zoom — me diga depois se for o caso (hoje a gravação usa o stream direto, sem canvas intermediário).

### O que NÃO muda
- Configuração de áudio, mixagem com música, ducking
- Persistência de roteiro e configurações de música
- Layout do teleprompter, controles de WPM, fontes
- Fluxo de upload e download

Após sua aprovação, faço a edição em `src/pages/Record.tsx`.