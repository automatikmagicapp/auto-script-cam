# Plano — Corrigir falha vermelha no build do APK

Sem o texto exato do log, vou cobrir as **3 causas mais frequentes** de falha vermelha em workflows Capacitor + Android no GitHub Actions, todas em uma única atualização do `.github/workflows/android-build.yml`.

## Causas prováveis

1. **Gradle sem permissão de execução** — `./gradlew assembleDebug` falha com `Permission denied` porque, em runners Linux, o arquivo `gradlew` recém-criado pelo `cap add android` nem sempre vem com bit de execução.
2. **SDK Android sem componentes / sem licença aceita** — o `setup-android@v3` instala o SDK, mas não aceita as licenças por padrão; sem isso o Gradle aborta no `assembleDebug`.
3. **Falta de ferramentas de build específicas** — o template do Capacitor 8 exige `build-tools;34.0.0` e `platforms;android-34`; se ausentes, a compilação falha em "SDK location not found" ou "Failed to find Build Tools revision".

Causa secundária (4): o passo "Verify dist folder" pode parar o pipeline com saída vermelha se o `npm run build` produzir warnings que viram erro — mas isso aparece no passo "Build web app", não em "Verify".

## Mudanças no `.github/workflows/android-build.yml`

- Aceitar licenças do Android SDK e instalar componentes explicitamente:
  ```yaml
  - name: Setup Android SDK
    uses: android-actions/setup-android@v3
    with:
      packages: 'platform-tools platforms;android-34 build-tools;34.0.0'

  - name: Accept Android SDK licenses
    run: yes | sdkmanager --licenses || true
  ```
- Garantir permissão de execução no Gradle wrapper antes do build:
  ```yaml
  - name: Make gradlew executable
    working-directory: android
    run: chmod +x ./gradlew
  ```
- Manter `--stacktrace --info` no `assembleDebug` para logs completos.
- Adicionar upload do log do Gradle como artefato **mesmo se o build falhar**, para que possamos ver a causa real na próxima tentativa:
  ```yaml
  - name: Upload Gradle logs on failure
    if: failure()
    uses: actions/upload-artifact@v4
    with:
      name: gradle-logs
      path: |
        android/build/**/*.log
        android/app/build/**/*.log
  ```

## Resultado esperado

- Se a falha era licença/SDK/permissão → o build passa e o APK aparece em **Artifacts** como `autoteleprompter-debug-apk`.
- Se a falha era outra → teremos o log completo do Gradle anexado como artefato `gradle-logs`, e poderei diagnosticar com precisão na próxima rodada.

## O que você precisa fazer depois

1. Aprovar este plano (vou aplicar a edição automaticamente).
2. No GitHub, abrir a aba **Actions** → workflow **Build Android APK** → clicar **Re-run all jobs**.
3. Se ainda ficar vermelho, baixar o artefato `gradle-logs` (ou copiar as últimas 30 linhas do passo vermelho) e me enviar.
