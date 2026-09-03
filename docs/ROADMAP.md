# The World Remembers — Roadmap

Where the build goes next, grounded in what actually exists. The theme is a
mobile-first social experience ("a friendzone no one wants to leave"), judged
on "would you invite your friends, would you stay, would you come back
tomorrow." The roadmap is the proof the world keeps growing after the
hackathon, not a one-shot thesis demo.

**Status: built for the DCL Friendzone 2026 MANA Buildathon (submission by
Sep 4); the World and its persistence backend are live and public.**

## What is real today (the foundation the roadmap builds on)

- A persistent World (`worldremembers.dcl.eth`) where every tap is a Postgres
  row; the tree grows, the community memory level rises, the lighthouse
  evolves.
- A **daily deterministic expedition** (3 fragments in a themed Memory Realm)
  that changes every day and never repeats — the "come back tomorrow" hook is
  already coded and server-authoritative.
- **Memory Stones** and **location reactions**: persistent traces other players
  can read, one per player, moderation-safe by whitelist.
- **Live co-presence**: when friends are actually at the tree, the restoration
  payoff visibly amplifies ("brought back together with N explorers"). Additive,
  solo-safe.
- The whole thing runs on a durable Render + Neon backend with a full Node
  test suite, so expansion is additive, not a rewrite.

## Next features (short horizon)

1. **Friend invites that carry context** — the INVITE A FRIEND share button
   already exists; make the invite land a player **into the same Daily Realm**,
   so two friends drop in together rather than meeting by chance.
2. **Co-presence beyond the tree** — extend the "at the tree" proximity count
   to the whole Expedition: a pair or trio exploring the same realm gets a
   shared trail beacon and a shared restoration credit, strengthening the
   "a challenge people replay together" leg.
3. **Weekly collective goal** — a graduated community target (restore N
   memories in a week) with a distinct payoff, layered on the existing derived
   score so it needs no new tables.

## Path to a real user base

- **Onboarding funnel**: today the first visit teaches the loop in seconds
  (contextual mission card + proximity CTA). Next: a session-scoped "what's
  new" that brings a returning player straight to their unfinished/next
  objective rather than the menu.
- **Return loop**: the daily expedition + rare memory already give a concrete
  reason to return. Add a lightweight "N explorers returned today" feed on the
  Journal so the *community* (not just the world) visibly stays alive.
- **Discovery**: `show_in_places: true` is set; appearing in the in-app Worlds
  browse catalog additionally requires the NAME-owning wallet to hold LAND or
  an active LAND rental. That is an address/gate step, not code — worth
  pursuing to get into the curated catalog.

## Demo → product

What it would take to go from hackathon World to an ongoing social product:

- **Durability** — already on durable Render + Neon, not tunnels. Add metrics
  (per-day DAU/retention from the existing tables, no client identity beyond
  the already-logged address).
- **Moderation at scale** — the whitelisted reactions are moderation-safe by
  construction; a future free-text memory would need a real moderation path.
- **Cost/scale** — Neon free tiers throttle under sustained load; a product
  version would move to a paid tier or add connection pooling expectations.
- **Not in scope / honest limits** — no free-text chat, no economy, no
  on-chain settlement. Those are deliberately out so the social loop stays the
  product; if the world grows a reason to hold value (e.g. collectible rare
  memories), a settlement layer is the natural next architecture, not a bolt-on.

Everything here is proposable today and additive: it reuses the derived-state
backbone and the scene's existing entity budget rather than demanding a
rewrite.