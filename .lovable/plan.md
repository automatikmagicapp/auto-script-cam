
# Teleprompter Automático — App Android Nativo

App de teleprompter para gravação de vídeos usando a câmera frontal do celular, com texto rolando automaticamente (por voz ou velocidade manual), biblioteca de roteiros e armazenamento dos vídeos na nuvem com possibilidade de download/compartilhamento.

---

## O que será construído

### 1. Tela inicial / Biblioteca de roteiros
- Lista dos roteiros salvos (título, prévia do texto, data)
- Botão "Novo roteiro" e "Nova gravação"
- Lista das gravações já feitas (com player, botão de download e botão de compartilhar link)

### 2. Editor de roteiro
- Campo de título e área de texto grande para colar/escrever o script
- Botão "Salvar" e "Iniciar gravação com este roteiro"

### 3. Tela de gravação (a principal)
Layout em camadas:
```text
+----------------------------------+
|   [vídeo da câmera frontal]      |
|                                  |
|   ┌──────────────────────────┐   |
|   │   TEXTO ROLANDO AQUI     │   |  <- overlay semi-transparente
|   │   (linha destacada no    │   |
|   │    centro)               │   |
|   └──────────────────────────┘   |
|                                  |
|  [⏺ Gravar]  [⏸]  [⏹]  [⚙]     |
+----------------------------------+
```
- Câmera frontal (selfie) ocupa a tela toda
- Texto sobreposto, com painel ajustável (tamanho da fonte, cor, opacidade do fundo, largura)
- Linha central destacada para guiar o olhar
- Contagem regressiva 3-2-1 antes de começar a gravar
- Dois modos de rolagem (escolhidos antes de gravar):
  - **Manual:** velocidade em palavras por minuto (slider 80-250 PPM)
  - **Por voz:** reconhecimento de fala em português detecta as palavras lidas e avança o texto na sua velocidade real (usa Web Speech API nativa do Android via WebView)
- Controles: iniciar, pausar, parar, refazer
- Ao parar, abre tela de revisão

### 4. Tela de revisão da gravação
- Player com o vídeo gravado
- Botões: "Salvar na nuvem", "Baixar para o celular", "Descartar", "Regravar"
- Campo de título opcional

### 5. Configurações
- Tamanho da fonte padrão, cor do texto, cor de fundo do overlay, opacidade
- Espelhamento horizontal (desligado por padrão — pode ser adicionado depois se quiser)
- Velocidade padrão (PPM)
- Modo de rolagem padrão (manual/voz)

### 6. Autenticação
- Login com email/senha e Google
- Cada usuário vê apenas seus próprios roteiros e vídeos

---

## Armazenamento e nuvem

- **Roteiros** salvos em banco de dados (Lovable Cloud) — sincronizam entre dispositivos
- **Vídeos** enviados para storage privado na nuvem após a gravação
- Cada vídeo pode ser:
  - Reproduzido dentro do app
  - Baixado para a galeria do celular
  - Compartilhado por link temporário (signed URL)
- Política de segurança: cada usuário só acessa seus próprios arquivos

---

## Detalhes técnicos

- **Frontend:** React + Vite + Tailwind + shadcn/ui
- **Backend:** Lovable Cloud (Supabase) — auth, banco e storage
- **Mobile wrapper:** Capacitor (gera o projeto Android nativo)
- **Plugins Capacitor:** `@capacitor/camera`, `@capacitor/filesystem`, `@capacitor/share`, plus `MediaRecorder` API do WebView para gravar vídeo
- **Reconhecimento de voz:** Web Speech API (`webkitSpeechRecognition`) — funciona no WebView do Android
- **Tabelas no banco:**
  - `profiles` (dados do usuário)
  - `scripts` (roteiros: título, conteúdo, user_id)
  - `recordings` (metadados: título, caminho do arquivo, duração, script_id, user_id)
  - `user_settings` (preferências visuais e de rolagem)
  - `user_roles` (separada, para segurança)
- RLS habilitada em todas as tabelas
- Bucket privado `recordings` no Supabase Storage

---

## Guia passo a passo: Compilar no Android Studio

Depois que eu terminar o app, você seguirá estes passos no seu computador:

### A. Pré-requisitos (uma vez só)
1. **Instalar Node.js 20+** — https://nodejs.org
2. **Instalar Git** — https://git-scm.com
3. **Instalar Android Studio** — https://developer.android.com/studio
   - Durante a instalação, marque: Android SDK, Android SDK Platform, Android Virtual Device
4. Abrir o Android Studio uma vez para ele baixar os SDKs (deixe rodar até terminar)
5. Configurar a variável `ANDROID_HOME` (o instalador geralmente faz isso; em caso de erro, eu te oriento)

### B. Trazer o projeto para o seu computador
1. No Lovable, clicar em **GitHub → Connect to GitHub** e exportar o projeto
2. No seu computador, abrir o terminal e rodar:
   ```bash
   git clone https://github.com/SEU_USUARIO/NOME_DO_REPO.git
   cd NOME_DO_REPO
   npm install
   ```

### C. Adicionar a plataforma Android
```bash
npx cap add android
npx cap update android
npm run build
npx cap sync android
```

### D. Abrir no Android Studio
```bash
npx cap open android
```
Isso abre o projeto Android. Aguarde o "Gradle sync" terminar (barra inferior).

### E. Rodar em emulador
1. No Android Studio: menu **Tools → Device Manager → Create Device**
2. Escolher um Pixel 6, baixar a imagem do Android 13+
3. Clicar no botão verde "Run" (▶) no topo

### F. Rodar em celular físico
1. No celular: Configurações → Sobre o telefone → tocar 7x em "Número da versão" para ativar modo desenvolvedor
2. Em Opções do desenvolvedor → ativar **Depuração USB**
3. Conectar o celular por USB, autorizar
4. No Android Studio, selecionar seu celular no topo e clicar Run

### G. Gerar APK para instalar manualmente
1. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Quando terminar, clicar em "locate" na notificação
3. Copiar o `app-debug.apk` para o celular e instalar

### H. Gerar AAB para Play Store (opcional)
1. Menu **Build → Generate Signed Bundle / APK → Android App Bundle**
2. Criar uma keystore (guarde a senha!)
3. Selecionar "release" e gerar
4. Subir o `.aab` no Google Play Console

### I. Atualizações futuras
Sempre que eu fizer mudanças no Lovable:
```bash
git pull
npm install
npm run build
npx cap sync android
```
Depois rodar de novo no Android Studio.

Vou te acompanhar em cada etapa quando chegar a hora — qualquer erro que aparecer, é só me mandar a mensagem que eu te ajudo a resolver.

---

## Permissões Android que serão configuradas
- `CAMERA` — acessar a câmera frontal
- `RECORD_AUDIO` — gravar áudio do vídeo + reconhecimento de voz
- `INTERNET` — sincronizar com a nuvem
- `WRITE_EXTERNAL_STORAGE` / `READ_MEDIA_VIDEO` — salvar vídeos na galeria

---

## Ordem de implementação
1. Configurar Lovable Cloud (auth, banco, storage, RLS)
2. Telas de login/cadastro
3. Biblioteca + editor de roteiros
4. Tela de gravação com câmera, overlay de texto e modo manual
5. Modo voz (reconhecimento de fala)
6. Upload na nuvem + download + compartilhamento
7. Tela de configurações e contagem regressiva
8. Setup do Capacitor + configuração das permissões Android
9. Testes finais e guia de compilação personalizado
