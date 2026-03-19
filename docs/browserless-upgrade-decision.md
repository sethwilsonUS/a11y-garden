# Browserless Tier Upgrade Decision Framework

## Current Tier: Free (1,000 units/month)

Budget is set to 900 units (`BROWSERLESS_MONTHLY_UNIT_BUDGET=900`) to leave a 10% safety margin. The circuit breaker in `FallbackStrategy` disables BQL when 95% of the budget is consumed.

## Unit Cost Model

| Operation | Estimated Units |
|-----------|----------------|
| BaaS (Playwright session) | ~1 |
| BQL stealth (no proxy) | ~1 |
| BQL with residential proxy | ~1 + ~6/MB transferred |
| BQL reconnect + comprehensive browser scan | Monitor separately after launch — can add session/runtime overhead on protected sites |

## Upgrade Triggers

Review monthly when scan stats are available via `convex/scanStats.ts`:

| Metric | Threshold | Action |
|--------|-----------|--------|
| BQL scans/month | > 800 (80% of 1K) | Upgrade to Prototyping ($25/mo, 10K units) |
| BQL success rate | < 50% | Investigate — may be wasting units on sites BQL can't bypass |
| Avg units/scan | > 5 | Optimize: shorter timeouts, skip proxy when possible |
| Circuit breaker trips/month | > 3 | Budget is too tight for actual usage, upgrade |

## Cost Protections

1. **Auth gate**: Only signed-in users trigger BQL (anonymous users never consume units)
2. **Circuit breaker**: Disables BQL at 95% monthly budget
3. **Domain cache**: Known-WAF domains skip BaaS attempt (saves ~1 unit + 5-10s per scan)
4. **Responsive-site reuse**: BQL often reuses a single bypassed session for both viewports; only adaptive/mobile-specific sites need extra work
5. **Feature gates**: BQL bypass, comprehensive scans, and AGENTS.md generation are all limited to signed-in users

## Caveat

The in-app Browserless usage tracker is best-effort and in-memory per server
process. Treat Browserless dashboard numbers as the real source of truth,
especially on Vercel where multiple instances may be active.

## Tier Comparison

| Tier | Units/month | Price | BQL scans (est.) |
|------|------------|-------|------------------|
| Free | 1,000 | $0 | ~500-900 |
| Prototyping | 10,000 | $25/mo | ~5,000-9,000 |
| Scale | 50,000 | $100/mo | ~25,000-45,000 |

## Decision Log

_No upgrades yet. Populate from `scanStats.getScanStats()` data after launch._
