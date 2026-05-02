import type { CapacitorConfig } from '@capacitor/cli';

// When CAP_PRODUCTION=1 (used by the GitHub Actions APK build),
// Capacitor packages the local `dist/` folder inside the APK so it works offline.
// Otherwise it points at the Lovable preview URL for live hot-reload during development.
const isProduction = process.env.CAP_PRODUCTION === '1';

const config: CapacitorConfig = {
  appId: 'app.lovable.6d71474419234d6eb3e82aa8863fdf39',
  appName: 'autoteleprompter',
  webDir: 'dist',
  ...(isProduction
    ? {}
    : {
        server: {
          url: 'https://6d714744-1923-4d6e-b3e8-2aa8863fdf39.lovableproject.com?forceHideBadge=true',
          cleartext: true,
        },
      }),
};

export default config;