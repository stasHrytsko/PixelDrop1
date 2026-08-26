import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.gametemplate',
  appName: 'Game Template',
  webDir: 'dist',
  android: {
    // Matches --bg in src/styles/tokens.css so there is no white flash on boot.
    backgroundColor: '#0f1115',
    zoomEnabled: false,
  },
  plugins: {
    SystemBars: {
      // Injects --safe-area-inset-* into the WebView. src/styles/tokens.css
      // reads those variables; turning this off breaks the layout on Android 15+.
      insetsHandling: 'css',
    },
  },
};

export default config;
