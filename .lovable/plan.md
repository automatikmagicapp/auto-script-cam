## Diagnóstico

O passo `npx cap add android` no GitHub Actions costuma falhar por 3 motivos comuns. Como não tenho o log exato do erro, o plano resolve **os três** de uma vez, deixando o workflow tolerante a falhas:

1. **Conflito de peer dependencies do npm** — `npm install` em CI é estrito e pode quebrar antes mesmo de chegar no `cap add`. Solução: usar `npm install --legacy-peer-deps`.
2. **Pasta `android/` já existe ou comando interativo** — `npx cap add android` falha se a pasta já existir, e em algumas versões pede confirmação. Solução: pular o `add` se a pasta já existe e rodar com flag não-interativa.
3. **`webDir` (`dist`) não encontrado no momento do `add`** — em alguns ambientes o `cap add` valida o `webDir`. Já estamos buildando antes, mas vou reforçar a ordem e adicionar log de verificação.

Também vou adicionar **logs de debug** em cada passo, para que se ainda assim falhar, o erro fique claro no próximo run.

## Mudanças no `.github/workflows/android-build.yml`

```yaml
- name: Install dependencies
  run: npm install --legacy-peer-deps

- name: Build web app
  run: npm run build
  env:
    CAP_PRODUCTION: '1'

- name: Verify dist folder
  run: ls -la dist/ && test -f dist/index.html

- name: Add Android platform (if missing)
  run: |
    if [ ! -d "android" ]; then
      npx cap add android
    else
      echo "Android folder already exists, skipping add"
    fi
  env:
    CAP_PRODUCTION: '1'

- name: Sync Capacitor
  run: npx cap sync android
  env:
    CAP_PRODUCTION: '1'

- name: Build debug APK
  working-directory: android
  run: ./gradlew assembleDebug --stacktrace --info
```

Adições principais:
- `--legacy-peer-deps` no install
- Verificação de existência da pasta `dist` (falha cedo com mensagem clara)
- Guard para não rodar `cap add` duas vezes
- `--stacktrace --info` no gradle (se o erro for no build do APK, vamos ver exatamente onde)

## Próximo passo após aplicar

1. Eu aplico essas mudanças no workflow.
2. Você dá um **commit/push qualquer** (ou clica em "Re-run jobs" no GitHub Actions) para disparar o build novamente.
3. Se ainda falhar, **me cole aqui o trecho vermelho do log** do passo que quebrou — com as flags de debug acima conseguirei identificar a causa exata em uma única iteração.

## Alternativa se você já tem o log

Se você puder colar agora a mensagem de erro do "Add Android platform" (apenas as últimas ~20 linhas vermelhas), eu refino o plano para atacar a causa específica em vez de aplicar os 3 fixes preventivos.