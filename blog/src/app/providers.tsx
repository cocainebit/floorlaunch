"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import type { ReactNode } from "react";

const solanaConnectors = toSolanaWalletConnectors();

export function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#3b82f6",
          walletChainType: "solana-only",
          // Show Phantom and Solflare directly on the login modal instead
          // of a single button that opens a wallet chooser.
          walletList: ["phantom", "solflare", "detected_solana_wallets"],
        },
        // Wallet sign-in for a Solana audience, plus email for everyone else.
        loginMethods: ["wallet", "email"],
        externalWallets: { solana: { connectors: solanaConnectors } },
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
