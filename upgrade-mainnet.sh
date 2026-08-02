#!/bin/bash
# commas mainnet program UPGRADE: on-chain creator fee split (50/50) +
# withdraw_creator_fees. Run once, after topping up the upgrade authority.
# The upgrade buffer (~4.1 SOL) is temporary and refunds after; net cost is
# just tx fees.
set -euo pipefail
cd "$(dirname "$0")"

ADMIN_KEY=~/.config/solana/commas-mainnet-admin.json   # BNbCZ (upgrade authority + payer)
PROGRAM_KEY=target/deploy/floorlaunch-keypair.json
SO=target/deploy/floorlaunch.so

K=$(grep -Eo '[0-9a-f]{8}-[0-9a-f-]{27}' ~/Desktop/floorlaunch-rpc.txt 2>/dev/null | head -1)
[ -z "$K" ] && { echo "no Helius key in ~/Desktop/floorlaunch-rpc.txt"; exit 1; }
RPC="https://mainnet.helius-rpc.com/?api-key=$K"

PUB=$(solana address -k "$ADMIN_KEY")
BAL=$(solana balance "$PUB" --url "$RPC" | awk '{print $1}')
echo "=== commas program upgrade (fee split) ==="
echo "  upgrade authority/payer: $PUB  ($BAL SOL)"
echo "  program id : $(solana address -k "$PROGRAM_KEY")"
echo "  binary     : $(stat -f%z "$SO") bytes"
NEED=4.6
awk "BEGIN{exit !($BAL < $NEED)}" && { echo; echo "!! need ~$NEED SOL for the upgrade buffer (refunds after). Fund $PUB then re-run."; exit 1; }
read -r -p "Upgrade the mainnet program? (buffer ~4.1 SOL, refunds; net ~fees) [y/N] " ok
[ "$ok" = "y" ] || { echo "aborted"; exit 0; }

echo "--- 1/2 upgrade program ---"
solana program deploy \
  --url "$RPC" --keypair "$ADMIN_KEY" \
  --program-id "$PROGRAM_KEY" --upgrade-authority "$ADMIN_KEY" \
  --with-compute-unit-price 50000 "$SO"

echo "--- 2/2 redeploy indexer (new IDL + fee_receiver on create_market) ---"
( cd indexer && fly deploy )

echo
echo "DONE. On-chain creator fee split (50/50) is live."
echo "Creators claim via withdraw_creator_fees (permissionless payout to the fee receiver)."
