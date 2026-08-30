import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./index.css";
import { installLaunchFileConsumer } from "./lib/nativeFileOpen";
import { usePlayerStore } from "./store/playerStore";

installLaunchFileConsumer(window.launchQueue, (files) => {
  const store = usePlayerStore.getState();
  store.setPendingPlayerFiles(files);
  store.setActiveTab("player");
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
