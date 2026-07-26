/**
 * Wallet layer.
 *
 * Production path: Solana wallet-adapter (Phantom, Solflare) today; the
 * connection UX swaps to Privy once an app ID exists, and only this file
 * changes because everything downstream consumes the useFlWallet()
 * abstraction, never the adapter directly.
 *
 * Dev path (?dev=1): a localStorage burner keypair with an automatic
 * localnet airdrop, so transaction flows are testable headlessly where no
 * extension wallet exists.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useAnchorWallet,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  useWalletModal,
} from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import "@solana/wallet-adapter-react-ui/styles.css";

export const RPC_URL = "http://127.0.0.1:8899";
const DEV_KEY_STORAGE = "fl-dev-signer";

const isDevMode = () =>
  new URLSearchParams(window.location.search).has("dev");

function devKeypair(): Keypair {
  const stored = localStorage.getItem(DEV_KEY_STORAGE);
  if (stored) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored)));
  }
  const kp = Keypair.generate();
  localStorage.setItem(DEV_KEY_STORAGE, JSON.stringify([...kp.secretKey]));
  return kp;
}

export interface FlWallet {
  connected: boolean;
  publicKey: PublicKey | null;
  /** Anchor provider bound to the active signer; null when disconnected. */
  provider: anchor.AnchorProvider | null;
  connect: () => void;
  disconnect: () => void;
  label: string;
}

const FlWalletContext = createContext<FlWallet>({
  connected: false,
  publicKey: null,
  provider: null,
  connect: () => {},
  disconnect: () => {},
  label: "Connect wallet",
});

export const useFlWallet = () => useContext(FlWalletContext);

function DevBridge({ children }: { children: ReactNode }) {
  const [kp] = useState(devKeypair);
  const [ready, setReady] = useState(false);
  const connection = useMemo(() => new Connection(RPC_URL, "confirmed"), []);

  useEffect(() => {
    (async () => {
      try {
        const bal = await connection.getBalance(kp.publicKey);
        if (bal < 5e9) {
          const sig = await connection.requestAirdrop(kp.publicKey, 100e9);
          await connection.confirmTransaction(sig);
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  const value = useMemo<FlWallet>(() => {
    const wallet = {
      publicKey: kp.publicKey,
      signTransaction: async (tx: any) => {
        if (tx.partialSign) tx.partialSign(kp);
        else tx.sign([kp]);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        for (const tx of txs) {
          if (tx.partialSign) tx.partialSign(kp);
          else tx.sign([kp]);
        }
        return txs;
      },
    };
    return {
      connected: ready,
      publicKey: kp.publicKey,
      provider: ready
        ? new anchor.AnchorProvider(connection, wallet as any, {
            commitment: "confirmed",
          })
        : null,
      connect: () => {},
      disconnect: () => {},
      label: ready
        ? `dev ${kp.publicKey.toBase58().slice(0, 4)}..${kp.publicKey.toBase58().slice(-4)}`
        : "dev signer…",
    };
  }, [ready]);

  return (
    <FlWalletContext.Provider value={value}>{children}</FlWalletContext.Provider>
  );
}

function AdapterBridge({ children }: { children: ReactNode }) {
  const { connected, publicKey, disconnect } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { setVisible } = useWalletModal();
  const connection = useMemo(() => new Connection(RPC_URL, "confirmed"), []);

  const value = useMemo<FlWallet>(
    () => ({
      connected,
      publicKey: publicKey ?? null,
      provider:
        connected && anchorWallet
          ? new anchor.AnchorProvider(connection, anchorWallet, {
              commitment: "confirmed",
            })
          : null,
      connect: () => setVisible(true),
      disconnect,
      label:
        connected && publicKey
          ? `${publicKey.toBase58().slice(0, 4)}..${publicKey.toBase58().slice(-4)}`
          : "Connect wallet",
    }),
    [connected, publicKey, anchorWallet]
  );

  return (
    <FlWalletContext.Provider value={value}>{children}</FlWalletContext.Provider>
  );
}

export function FlWalletProvider({ children }: { children: ReactNode }) {
  if (isDevMode()) return <DevBridge>{children}</DevBridge>;
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AdapterBridge>{children}</AdapterBridge>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
