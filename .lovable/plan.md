## Problema

O passo "Add Android platform (if missing)" falhou com:

```
[fatal] The Capacitor CLI requires NodeJS >=22.0.0
```

A versão mais recente do `@capacitor/cli` agora exige Node.js 22 ou superior, mas o workflow está fixado em Node 20.

## Correção

Atualizar `.github/workflows/android-build.yml` no passo **Setup Node**:

```yaml
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: '22'
```

Trocar `node-version: '20'` por `node-version: '22'`. Isso resolve a incompatibilidade do Capacitor CLI sem afetar nenhum outro passo (Java 21, Android SDK 34, Gradle continuam idênticos).

## Próximos passos depois de aprovar

1. Lovable atualiza o arquivo automaticamente.
2. No GitHub: Actions → re-run do último workflow.
3. Build deve passar até o final e gerar o APK em **Artifacts → autoteleprompter-debug-apk**.
4. Se outro passo falhar, baixar `gradle-logs` (já configurado) para diagnóstico preciso.
