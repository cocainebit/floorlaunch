"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: "dark", accentColor: "#3b82f6" },
        // Email login for comments: identity only, no wallet/signing needed.
        loginMethods: ["email"],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
