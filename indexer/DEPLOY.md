# Deploying the commas indexer

The indexer is a long-lived Node process (Express REST + a WebSocket feed +
an on-chain event subscription). It must run on a host that keeps a process
alive with WebSocket support: **Fly.io, Railway, Render, or a VPS.** It will
not work on Vercel/serverless.

What it serves: `/markets`, `/listings`, `/candles/:market`, `/trades/:market`,
`/aggregator`, `/index/:market`, and a WebSocket at `/ws`. This is what the
frontend reads. It ships **no keys** by default and runs as a read-only API;
the price/graduation/fee keepers only activate if you provide keys (below).

## Environment

Required:

- `RPC_URL` — your Solana RPC (e.g. a Helius devnet or mainnet URL).

Optional:

- `RPC_WS_URL` — WS RPC. Auto-derived from `RPC_URL` if omitted.
- `PROGRAM_ID` — defaults to the deployed program id.
- `ORACLE_KEYPAIR` — JSON array or base64 of the oracle secret key. Set this
  only if you want the deployed indexer to also push oracle prices. Leave
  unset to run the keeper elsewhere and keep this box key-free.
- `ADMIN_KEYPAIR` — JSON array or base64 of the admin key, for the fee-sweep
  and auto-migration keepers. Leave unset to keep this box key-free.

`IDL_PATH`, `CATALOG_PATH`, and `LISTINGS_PATH` are set inside the image.

## Deploy to Fly.io

```bash
# one-time
brew install flyctl
fly auth login

cd indexer
fly launch --no-deploy          # accept the app name or edit fly.toml
fly secrets set RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
# optional keepers:
# fly secrets set ORACLE_KEYPAIR="[12,34,...]"
fly deploy
```

## Custom domain (api.commas.art)

```bash
fly certs add api.commas.art
```

Then at your DNS provider add the records Fly prints (an `A`/`AAAA` or a
`CNAME` to `commas-indexer.fly.dev`). Once the cert is issued, the API is at
`https://api.commas.art/` and the WS at `wss://api.commas.art/ws`.

## Point the frontend at it

In the blog/app env:

```
NEXT_PUBLIC_FLOORLAUNCH_API_URL=https://api.commas.art/
NEXT_PUBLIC_FLOORLAUNCH_WS_URL=wss://api.commas.art/ws
```

(The blog's token search reads `NEXT_PUBLIC_TOKENS_API`; point it at
`https://api.commas.art/listings`.)

## Notes

- On-chain market data rebuilds from the chain on every start, so the box is
  stateless; candle history and uploads live in `/app/data` and are ephemeral
  unless you attach a volume.
- Keep `min_machines_running = 1` so the WS + subscription never sleep.
- Railway/Render: use the same Dockerfile; set the same env vars; expose port
  8787.
