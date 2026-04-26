# AgentMkt Payment Hub (P2)

Hono service on `:4002` that wraps the Lexe sidecar, keeps an append-only
per-job ledger, pays L402 suppliers, and settles or cancels holds when the
orchestrator tells it to.

## Setup

From the repo root:

```sh
cp .env.example .env
pnpm install
```

Fill at least:

```sh
DATABASE_URL=postgres://...
LEXE_SIDECAR_URL=http://localhost:5393
LEXE_NETWORK=mainnet
PORT_HUB=4002
```

Run the initial migration:

```sh
pnpm db:migrate
```

## Lexe Sidecar

Download the Lexe sidecar binary manually from the Lexe docs / releases page,
place it at:

```sh
apps/hub/bin/lexe-sidecar
chmod +x apps/hub/bin/lexe-sidecar
```

If Lexe gives client credentials, set:

```sh
LEXE_CLIENT_CREDENTIALS=...
```

The hub will spawn the binary on boot if present. You can also run the sidecar
manually as long as it listens on `LEXE_SIDECAR_URL`.

Check health:

```sh
pnpm dev:hub
curl http://localhost:4002/health/lexe
```

## H4 Milestone: Move 1 Sat

With the sidecar healthy:

```sh
pnpm smoke:1sat
```

Pay the printed BOLT11 invoice from a personal Lightning wallet. When it
confirms, paste the payment index and preimage/status proof into the team
channel.

## Sponsor Funding

Once the sidecar wallet is live, request 20,000 sats from the sponsor:

```sh
pnpm --filter @agentmkt/hub start
curl -X POST http://localhost:4002/hub/topup \
  -H 'content-type: application/json' \
  -d '{"job_id":"job_bootstrap_funding","amount_sats":20000}'
```

Send the returned `bolt11` to the sponsor. After they pay it:

```sh
curl -X POST http://localhost:4002/hub/topup/status \
  -H 'content-type: application/json' \
  -d '{"bolt11":"PASTE_BOLT11_HERE"}'
```

That idempotently writes the `topup` ledger row.

## Local Happy Path Smoke

Run three terminals:

```sh
pnpm dev:hub
pnpm fake-supplier
pnpm smoke:happy
```

`smoke:happy` exercises:

1. `/hub/topup`
2. `/hub/topup/status`
3. `/hub/hold`
4. `/hub/forward`
5. `/hub/settle`
6. `/hub/job-balance/:job_id`
7. `/hub/cancel`

The fake supplier uses the same sidecar, so it validates the route/ledger/L402
code paths without proving cross-node Lightning routing. For the real demo,
point `/hub/forward` at P3's MDK supplier endpoints.

## API Surface

The implemented P2 endpoints are exactly the section 6.2 contracts:

- `POST /hub/topup`
- `POST /hub/topup/status`
- `POST /hub/hold`
- `POST /hub/forward`
- `POST /hub/settle`
- `POST /hub/cancel`
- `POST /hub/notify-human`
- `POST /hub/human-submit`
- `GET /hub/job-balance/:job_id`

