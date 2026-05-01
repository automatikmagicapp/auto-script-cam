## Problema

Comparando os dois prints:

- **Câmera nativa do telefone (imagem 1)**: enquadramento natural, rosto proporcional, pega a janela inteira ao redor.
- **App (imagem 2)**: rosto "esticado" / muito próximo, perde as laterais da janela e do ambiente — parece um close distorcido.

### Causa raiz

Em `src/pages/Record.tsx` a câmera é aberta com:

```
width: { ideal: 1920 }, height: { ideal: 1080 }
```

Isso pede ao navegador um stream **16:9 horizontal** (1920x1080), independente do telefone estar em pé. Depois, o loop de composição (`startCompositionLoop`, linhas 424–485) cria um canvas 1080x1920 (9:16) e **recorta as laterais** desse stream horizontal para caber no formato vertical:

```
if (srcAspect > targetAspect) cropW = srcH * targetAspect;
```

Ou seja: estamos jogando fora ~70% da largura do sensor e usando só a faixa central. Isso aproxima o rosto e elimina o ambiente — exatamente o que aparece na imagem 2.

A câmera nativa do Android, ao contrário, abre o sensor já em **retrato** (ex.: 1080x1920) e usa o frame inteiro — por isso pega a janela toda.

## Solução

Pedir ao navegador o stream **já no formato da orientação atual**, em vez de forçar 1920x1080. Quando o canvas 9:16 receber um stream que também é 9:16, não há recorte lateral — o app passa a mostrar exatamente o mesmo enquadramento da câmera nativa.

### Mudanças em `src/pages/Record.tsx`

**1. `initCamera()` — pedir resolução conforme orientação**

Trocar a constraint fixa por uma calculada a partir de `activeOrientation`:

- Portrait (9:16) → `width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9/16 }`
- Landscape (16:9) → `width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16/9 }`

Em desktop (webcam 16:9 nativa) o navegador ignora `aspectRatio` impossível e devolve o que conseguir — o canvas continua compensando, então não quebra nada.

**2. Reabrir a câmera ao trocar de orientação antes de gravar**

Hoje só travamos a orientação ao clicar "Gravar". Vou adicionar um `useEffect` que, enquanto não está gravando, reabre o stream quando `activeOrientation` muda — assim o preview já reflete o enquadramento real que será gravado.

Durante a gravação a orientação está travada, então não reabre nada (mantém o arquivo contínuo).

**3. Loop de composição — ajustar quando fontes têm o mesmo aspecto**

Em `startCompositionLoop` (linha 459), quando `srcAspect ≈ targetAspect` (caso novo, mobile vertical), o cálculo de crop já resolve sozinho sem cortar nada (`cropW = srcW`, `cropH = srcH`). Sem mudança lógica, só validar.

**4. Zoom inicial = mais amplo possível**

Já fazemos isso, mas vou reforçar: ao detectar `getCapabilities().zoom`, aplicar `zoom: min` imediatamente no novo stream vertical (algumas câmeras de celular têm `min: 0.5` que é a "wide angle"/0.5x — exatamente o efeito desejado).

**5. Fallback `object-contain` quando o stream for menor que o stage**

Já existe (`zoom < 1 ? object-contain : object-cover`). Sem mudança.

## O que o usuário vai ver depois

- Em modo Stories (9:16) no celular, o preview e o vídeo final terão o **mesmo enquadramento da câmera nativa** — pega a janela inteira, parede ao redor, sem rosto "puxado".
- Slider de zoom continua funcionando normalmente para aproximar quando quiser.
- Botão de trocar para landscape (16:9) reabre a câmera no formato horizontal automaticamente.

## Riscos

Baixos. Mudança concentrada em `initCamera()` + um `useEffect` de re-init. Não toca em áudio, mixagem, gravação, banco ou auth. Em desktop pode haver um pequeno flicker ao alternar orientação no preview (aceitável, não acontece durante a gravação).

## Arquivos

- `src/pages/Record.tsx` (~25 linhas alteradas)
