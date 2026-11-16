# Token Radar

A pre-token protocol radar built from the DefiLlama snapshot. It ranks the watchlist and an early
set of sub-floor protocols by **implied value** — a transparent model, recomputed live on the page,
that never claims to be a price.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)

## What it does

- **Board** — 200 rows: the 40-protocol watchlist plus 160 early protocols below the $50M floor.
  Every row carries TVL, 7-day growth, age with no token, implied value and the multiple of TVL.
- **Model radar-2** — `implied = tvl × 0.25 × growth × maturity × category_premium × chain_reach`.
  The category premium is *measured* from protocols in the same category that already trade (median
  mcap/TVL), not hand-written. Chain reach adds at most 1.4× across many chains.
- **Farm plan** — each row carries concrete steps with cost and time, so the radar says what to do
  next, not just what to look at.
- **Two views** — pre-token radar and the live-token protocols set aside with their market caps.

## Run it

```bash
MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`.

## The model, stated plainly

```
implied = round( tvl_usd
               × 0.25                                   base multiple
               × (1 + clamp(change_7d, -60, 120)/100 × 0.5)   growth
               × (0.6 + min(age_days, 1095)/1095 × 0.4)       maturity
               × category_premium                       measured from token peers
               × chain_reach )                          1 + 0.035 × (chains - 1), cap 1.4
```

The page recomputes every row from these constants and the row's own figures, and the number it
lands on is the number `board.json` carries — the model is verifiable, not a black box.

This is an estimate. It is not a price, not financial advice, and not a promise that any of these
protocols will ever issue a token.

## License

MIT — see `LICENSE`.
