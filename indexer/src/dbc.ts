/**
 * Meteora DBC launch executor.
 *
 * Launches a token as a **Meteora Dynamic Bonding Curve** pool instead of the
 * internal Commas curve (see devLaunch in launch.ts). The DBC pool:
 *   - creates an EXTERNAL SPL mint with a fixed 1B supply (no program premint,
 *     so total supply reads exactly 1,000,000,000 - not the old ~1.6B),
 *   - writes on-chain Metaplex metadata pointing at /token-metadata/:market.json,
 *     so Solscan and terminals render the collectible as the token's identity,
 *   - trades on a real Meteora pool (visible on Axiom/Photon/Solscan),
 *   - charges a 0.7% base fee, split 50/50 protocol/creator.
 *
 * We then attach a Commas market via `create_external_market` (the oracle +
 * hedging layer) and seed the peg with push_index + push_mark. The full 1B
 * stays on the Meteora curve - no treasury reserve is carved out, because
 * hedging is CASH-SETTLED: a short posts SOL collateral and its PnL settles in
 * SOL against the oracle index (no synth tokens are drawn or handed out). The
 * cash-settled short logic is the Phase 2 program rework; Phase 1 ships spot
 * trading + visibility + the clean fixed 1B.
 */
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { homedir } from "node:os";
import {
  DynamicBondingCurveClient,
  buildCurveWithMarketCap,
  deriveDbcPoolAddress,
  TokenType,
  TokenDecimal,
  TokenAuthorityOption,
  MigrationOption,
  MigrationFeeOption,
  CollectFeeMode,
  ActivationType,
  BaseFeeMode,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { resolveSecretKey } from "./keypair.js";
import {
  ListingMeta,
  loadListings,
  saveListing,
  catalogByIdentifier,
  oracleFeedLamports,
  solUsdPrice,
  FEE_TREASURY,
} from "./launch.js";

const LAMPORTS = 1e9;
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
const ORACLE_KEY = `${homedir()}/floorlaunch/relayer/keys/oracle-sim.json`;

// Fixed supply and economics, matched to the existing launch math: 1B supply,
// ~25 SOL opening market cap, migrate to a DAMM pool at ~625 SOL. The oracle
// index is launch-scaled the same way devLaunch scales it.
const TOTAL_SUPPLY = 1_000_000_000;
const INITIAL_MARKET_CAP_SOL = 25;
const MIGRATION_MARKET_CAP_SOL = 625;
const BASE_FEE_BPS = 70; // 0.7%
const CREATOR_FEE_PCT = 50; // 50/50 protocol/creator split
const UNIT_LAMPORTS_AT_LAUNCH = 625_000_000; // 0.625 SOL per 1M tokens

/**
 * Build the DBC config parameters for a collectible launch: 1B supply, 0.7%
 * flat base fee, 50% creator share, migrate to DAMM v2. The FULL 1B goes on the
 * curve (no reserve carve) - hedging is cash-settled against SOL collateral, so
 * no token treasury is needed.
 */
export function buildConfig() {
  return buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.NINE, // SOL
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: TOTAL_SUPPLY,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: BASE_FEE_BPS,
          endingFeeBps: BASE_FEE_BPS,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: CREATOR_FEE_PCT,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    // Migrated-DAMM LP distribution. Meteora requires >=10% locked at day 1;
    // we lock 100% permanently (LP can never be pulled - the trustworthy default).
    // The creator still earns trading fees via creatorTradingFeePercentage.
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 0,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 100,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: INITIAL_MARKET_CAP_SOL,
    migrationMarketCap: MIGRATION_MARKET_CAP_SOL,
  });
}

/**
 * Launch a collectible market on Meteora DBC and attach the Commas oracle
 * market. Returns the Commas market PDA, the Meteora pool, and the mint.
 */
export async function dbcLaunch(
  rpcUrl: string,
  programId: string,
  idl: any,
  body: {
    collectionId?: string;
    identifier?: string;
    meta: Omit<ListingMeta, "launchedAt" | "identifier">;
  }
): Promise<{ market: string; pool: string; mint: string; indexLamports: number }> {
  const u = body.identifier
    ? catalogByIdentifier(body.identifier)
    : catalogByIdentifier(body.collectionId ?? "");
  if (!u) throw new Error("unknown underlying");

  const indexLamports = (await oracleFeedLamports(u, await solUsdPrice()))!;
  if (!indexLamports) throw new Error("no oracle price available for this collectible");

  const adminSecret = resolveSecretKey({
    keyEnv: "ADMIN_KEYPAIR",
    pathEnv: "ADMIN_KEY_PATH",
    defaultPath: `${homedir()}/.config/solana/id.json`,
  });
  const oracleSecret = resolveSecretKey({
    keyEnv: "ORACLE_KEYPAIR",
    pathEnv: "ORACLE_KEY_PATH",
    defaultPath: ORACLE_KEY,
  });
  if (!adminSecret || !oracleSecret) {
    throw new Error("launch signer not configured (set ADMIN_KEYPAIR + ORACLE_KEYPAIR)");
  }
  const admin = Keypair.fromSecretKey(adminSecret);
  const oracle = Keypair.fromSecretKey(oracleSecret);
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl, provider);
  const pid = new PublicKey(programId);

  // 1) Create the Meteora DBC config + pool (external mint, fixed 1B, metadata).
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const config = Keypair.generate();
  const baseMint = Keypair.generate();
  const metadataUri = `${process.env.PUBLIC_BASE_URL ?? "https://commas-indexer.fly.dev"}/token-metadata/${baseMint.publicKey.toBase58()}.json`;

  const configParams = buildConfig();
  const createTx: Transaction = await client.partner.createConfigAndPool({
    config: config.publicKey,
    feeClaimer: new PublicKey(FEE_TREASURY),
    leftoverReceiver: admin.publicKey,
    quoteMint: WSOL,
    payer: admin.publicKey,
    ...configParams,
    preCreatePoolParam: {
      name: body.meta.name,
      symbol: body.meta.ticker,
      uri: metadataUri,
      poolCreator: admin.publicKey,
      baseMint: baseMint.publicKey,
    },
  });
  await provider.sendAndConfirm(createTx, [config, baseMint]);
  const pool = deriveDbcPoolAddress(WSOL, baseMint.publicKey, config.publicKey);

  // 2) Attach the Commas oracle/hedging market to the external mint. The market
  // collection id is a fresh hash (the underlying association lives in the
  // listing), matching the internal launcher's scheme.
  const { createHash, randomBytes } = await import("node:crypto");
  const collection = new PublicKey(
    createHash("sha256")
      .update(`${u.identifier}|${Date.now()}|${randomBytes(8).toString("hex")}`)
      .digest()
  );
  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global")], pid);
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), collection.toBuffer()],
    pid
  );
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), marketPda.toBuffer()],
    pid
  );
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPda.toBuffer()],
    pid
  );

  const unitsPerItemMicro = Math.max(
    1,
    Math.round((indexLamports / UNIT_LAMPORTS_AT_LAUNCH) * 1e6)
  );
  // MarketParams for the external market. Hedging is cash-settled (Phase 2), so
  // maxOpenInterest is a notional OI cap (0 = set in the Phase 2 rework), NOT a
  // token reserve. Curve/amm fee bps are irrelevant here (trades run on Meteora).
  const params = {
    indexWindowSecs: 30,
    minPushIntervalSecs: 0,
    breakerBps: 3000,
    maxIndexAgeSecs: 3600,
    markWindowSecs: 60,
    fundingKBps: 10000,
    maxFundingBpsPerDay: 10000,
    minCrankIntervalSecs: 1,
    initialCrBps: 15000,
    maintenanceCrBps: 12000,
    liqBonusBps: 500,
    maxOpenInterest: new BN(0),
    itemReserve: new BN(0),
    unitsPerItemMicro: new BN(String(unitsPerItemMicro)),
    curveFeeBps: 70,
    ammFeeBps: 70,
    graduationTargetSol: new BN(MIGRATION_MARKET_CAP_SOL).mul(new BN(LAMPORTS)),
    insuranceShareBps: 0,
    curveVirtualSol: new BN(INITIAL_MARKET_CAP_SOL).mul(new BN(LAMPORTS)),
    curveVirtualTokens: new BN(String(BigInt(TOTAL_SUPPLY) * 1_000_000n)),
  };

  await program.methods
    .createExternalMarket(collection, params as any)
    .accountsPartial({
      global: globalPda,
      admin: admin.publicKey,
      market: marketPda,
      synthMint: baseMint.publicKey,
      treasury: treasuryPda,
      solVault: solVaultPda,
    })
    .rpc();

  // 3) Seed the peg: index (collectible oracle price, drives CDP/funding/
  // liquidation) and mark (traded price; at launch = the launch-scaled unit).
  const pushIndexIx = await program.methods
    .pushIndex(new BN(UNIT_LAMPORTS_AT_LAUNCH))
    .accountsPartial({ global: globalPda, oracleAuthority: oracle.publicKey, market: marketPda })
    .instruction();
  const pushMarkIx = await program.methods
    .pushMark(new BN(UNIT_LAMPORTS_AT_LAUNCH))
    .accountsPartial({ global: globalPda, oracleAuthority: oracle.publicKey, market: marketPda })
    .instruction();
  const seedTx = new anchor.web3.Transaction().add(pushIndexIx).add(pushMarkIx);
  await provider.sendAndConfirm(seedTx, [oracle]);

  // 4) No treasury funding: the full 1B trades on the Meteora curve. Hedging is
  //    cash-settled (SOL collateral, PnL vs the oracle index) and lands with the
  //    Phase 2 program rework of open_short/close/liquidate/funding. Phase 1
  //    delivers spot trading + terminal/Solscan visibility + the clean 1B.

  const listings = loadListings();
  listings[marketPda.toBase58()] = {
    ...body.meta,
    identifier: u.identifier,
    venue: "meteora",
    synthMint: baseMint.publicKey.toBase58(),
    dbcPool: pool.toBase58(),
    feePaymentSig: (body as any).feePaymentSig ?? null,
    indexAtLaunchLamports: indexLamports,
    unitsPerItemMicro,
    launchedAt: Math.floor(Date.now() / 1000),
  } as any;
  saveListing(listings);

  return {
    market: marketPda.toBase58(),
    pool: pool.toBase58(),
    mint: baseMint.publicKey.toBase58(),
    indexLamports,
  };
}
