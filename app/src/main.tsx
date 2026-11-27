import "@rainbow-me/rainbowkit/styles.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource-variable/manrope";
import "./styles.css";

import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";

import { App } from "./App.js";
import { config } from "./wagmi.js";

const DevAgentation = import.meta.env.DEV
  ? React.lazy(() => import("agentation").then(({ Agentation }) => ({ default: Agentation })))
  : null;

const queryClient = new QueryClient();
const walletTheme = lightTheme({ accentColor: "#245642", borderRadius: "small", fontStack: "system" });

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={walletTheme}>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
    {DevAgentation && (
      <React.Suspense fallback={null}>
        <DevAgentation />
      </React.Suspense>
    )}
  </React.StrictMode>,
);
