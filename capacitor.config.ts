import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mp5.player",
  appName: "MP5 Player",
  webDir: "apps/web/dist",
  server: { androidScheme: "https" },
};

export default config;
