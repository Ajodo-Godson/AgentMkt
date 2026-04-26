# AgentMkt Design Context

## Register
Product UI. Design serves task completion and demo clarity.

## Theme
Light restrained workspace for a founder/operator demoing paid-agent routing on a laptop or projector. The interface should feel close to Stripe, Vercel, and Linear: white surfaces, quiet navigation, clear cards, and strong readability in bright rooms.

## Color
Use OKLCH tokens. Neutrals are slightly cool, never pure black or white. Purple is the primary product accent for active navigation, focus, and primary actions. Green is verified/settled. Blue is routing/info. Amber is approval or payment caution. Red is failure or meaningful risk.

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
