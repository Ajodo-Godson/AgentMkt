# AgentMkt Design Context

## Register
Product UI. Design serves task completion and demo clarity.

## Theme
Dark restrained console for a founder/operator running a live paid-agent job on a laptop. The room may be dim during a demo, but the interface must stay readable on a projector.

## Color
Use OKLCH tokens. Neutrals are slightly warm, never pure black or white. Amber is reserved for Lightning/payment and primary actions. Green is verified/settled. Blue is routing/info. Red is failure or meaningful risk.

## Typography
Use Geist/system UI. Keep labels and controls familiar. Use monospace only for sats, job IDs, timestamps, and execution logs.

## Layout
Predictable three-column product console on desktop:
- Request and result on the left.
- Route timeline and worker alternatives in the center.
- Wallet and approval summary on the right.

On mobile, stack request, route, wallet, result, and logs in that order. Avoid nested cards and repeated identical card grids.

## Motion
Use short 150-250ms transitions for state changes only. No decorative page-load choreography.
