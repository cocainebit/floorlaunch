import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { FlWalletProvider } from "./wallet";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FlWalletProvider>
      <App />
    </FlWalletProvider>
  </StrictMode>
);
