import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.6d71474419234d6eb3e82aa8863fdf39',
  appName: 'Teleprompter',
  webDir: 'dist',
  server: {
    url: 'https://6d714744-1923-4d6e-b3e8-2aa8863fdf39.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;