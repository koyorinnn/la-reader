import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'app.la.reader', appName: 'Lá Reader', webDir: 'dist',
  backgroundColor: '#f7f8f2',
  ios: { contentInset: 'never', allowsLinkPreview: false },
  android: { allowMixedContent: false }
};
export default config;
