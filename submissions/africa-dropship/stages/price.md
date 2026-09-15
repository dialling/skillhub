# Stage C — 体积 / 运费 / 利润

## Goal

Compute landed cost and sell price from **user freight sheet**; pass **G3**.

## Steps

1. Collect L×W×H, actual weight, destination zone, shipping product (from user).
2. Compute volumetric weight with **user’s divisor / rules** (ask if missing — do not assume).
3. Chargeable weight = max(actual, volumetric) unless sheet says otherwise.
4. Look up freight in the user’s calculation table (user must provide sheet/rows).
5. Build full **定价卡** ([templates.md](../templates.md)).
6. Compare to competitor band; conclude 达标/不达标.
7. **Human checkpoint:** 首单定价复核.

## Agent constraints

- **Never invent freight rates, fuel surcharges, or customs.** If table missing → request it and stop calculation.
- Show formula inputs so user can audit.
- If margin fails: propose lever options (cheaper supplier, smaller pack, kill SKU) — do not silently lower quality claims.

## Done when

定价卡 complete with table reference + pass/fail.
