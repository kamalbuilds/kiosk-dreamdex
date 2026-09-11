#!/usr/bin/env bash
# Deploy KioskRouter to Shannon and write the address back into .env.
# Somnia prices state creation aggressively, so gas is estimated by the node.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "kiosk/.env missing. Copy .env.example and add a funded PRIVATE_KEY."; exit 1; }
set -a; . ./.env; set +a

if [ -z "${COLLATERAL:-}" ]; then
  COLLATERAL=$(node -e "import('@somnia-chain/markets-sdk').then(m=>console.log(m.SOMNIA_TESTNET_ADDRESSES.testUsdc))" --experimental-default-type=module 2>/dev/null \
    || node -e "console.log(require('./web/node_modules/@somnia-chain/markets-sdk/dist/addresses.js').SOMNIA_TESTNET_ADDRESSES.testUsdc)")
  export COLLATERAL
fi
echo "collateral: $COLLATERAL"

cd contracts
forge script script/Deploy.s.sol \
  --rpc-url "${RPC_URL:-https://dream-rpc.somnia.network}" \
  --broadcast --slow -vvv 2>&1 | tee /tmp/kiosk-deploy.log

ADDR=$(grep -Eo 'KioskRouter +0x[0-9a-fA-F]{40}' /tmp/kiosk-deploy.log | tail -1 | grep -Eo '0x[0-9a-fA-F]{40}')
[ -n "$ADDR" ] || { echo "could not parse the deployed address out of the broadcast log"; exit 1; }
echo "deployed: $ADDR"

cd ..
# Rewrite the two address lines in place, leaving the key untouched.
tmp=$(mktemp)
grep -v -E '^(KIOSK_ROUTER|NEXT_PUBLIC_KIOSK_ROUTER|COLLATERAL)=' .env > "$tmp"
{ echo "KIOSK_ROUTER=$ADDR"; echo "NEXT_PUBLIC_KIOSK_ROUTER=$ADDR"; echo "COLLATERAL=$COLLATERAL"; } >> "$tmp"
mv "$tmp" .env
chmod 600 .env
echo "wrote KIOSK_ROUTER to kiosk/.env"

# Next only reads env from web/, not the repo root. Mirror the public address and
# the faucet key across, without disturbing anything else already in .env.local.
touch web/.env.local
tmp2=$(mktemp)
grep -v -E '^(NEXT_PUBLIC_KIOSK_ROUTER|PRIVATE_KEY)=' web/.env.local > "$tmp2" || true
{ echo "NEXT_PUBLIC_KIOSK_ROUTER=$ADDR"; echo "PRIVATE_KEY=${PRIVATE_KEY}"; } >> "$tmp2"
mv "$tmp2" web/.env.local
chmod 600 web/.env.local
echo "mirrored NEXT_PUBLIC_KIOSK_ROUTER into kiosk/web/.env.local"
