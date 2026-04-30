# Corrigir velocidade do teleprompter

## O problema

Encontrei **dois bugs** que impedem você de aumentar a velocidade da rolagem do texto:

### 1. A velocidade "congela" quando a gravação começa (bug principal)

No arquivo `src/pages/Record.tsx`, a função `startManualScroll()` usa o valor de `wpm` **no momento em que é chamada**. Como ela roda dentro de um `requestAnimationFrame` em loop, o valor de `wpm` fica preso (closure) no número que existia quando a gravação começou. Mesmo se você mexer no slider depois, o loop continua usando o valor antigo.

O mesmo vale para `fontSize` — mudanças durante a gravação não são aplicadas.

### 2. O limite máximo é baixo demais

O slider de velocidade vai só até **250 palavras/min**. Para uma leitura realmente rápida, isso é pouco. Além disso, a fórmula de conversão (`wpm / 60 / 7 * fontSize * 1.4`) é conservadora — com fonte 42px e 250 wpm dá ~35 px/s, que visualmente parece lento.

### 3. Painel de ajustes some durante a gravação

O painel de configurações (engrenagem) só aparece na fase `setup`. Não dá para ajustar velocidade no meio da gravação para acelerar/desacelerar conforme você lê.

## O que vou mudar

### A. Corrigir a closure travada
Usar `useRef` para `wpm` e `fontSize` (ex.: `wpmRef.current`) e ler dentro do loop `requestAnimationFrame`. Assim, qualquer mudança no slider passa a valer **imediatamente**, mesmo durante a gravação.

### B. Aumentar o alcance do slider
- Mínimo: 80 → **60** wpm
- Máximo: 250 → **500** wpm
- Passo: 5 (mantido)

### C. Adicionar multiplicador de velocidade visual
Incluir um fator `speedMultiplier` (1.0× a 3.0×) na fórmula de pixels/segundo, para que o usuário consiga acelerar bastante mesmo em fontes grandes. Apresentado como um slider extra "Velocidade fina" ou substituindo a fórmula por algo mais direto:

```text
pxPerSec = (wpm / 60) * (fontSize * 0.18) * speedMultiplier
```

Essa fórmula responde melhor: dobrar o wpm dobra a velocidade real na tela.

### D. Mostrar controles de velocidade DURANTE a gravação
Adicionar um mini-painel flutuante (canto da tela) na fase `recording` com:
- Slider de velocidade (wpm)
- Botões rápidos: **−** / **+** (ajuste de ±10 wpm)
- Visível só no modo manual

Assim você acelera/desacelera ao vivo sem parar a gravação.

### E. Persistir a preferência
Quando o usuário ajustar a velocidade, salvar em `user_settings.wpm` para que da próxima vez já abra com o valor preferido.

## Arquivos afetados

- `src/pages/Record.tsx` — refs para wpm/fontSize, novo slider range, controles em runtime, salvar preferência

## O que NÃO muda

- Modo "Por voz" (continua sincronizando pela fala)
- Layout geral, cores, fluxo de gravação
- Backend / banco de dados (apenas um UPDATE em `user_settings` ao mudar wpm)

Após sua aprovação, implemento as mudanças.
