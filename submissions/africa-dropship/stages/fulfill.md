# Stage E — 出单采购发货

## Goal

Move paid orders through 1688 purchase → tracking; handle **G5** exceptions.

## Steps

1. On order: verify SKU mapping, qty, address completeness, paid status.
2. Place 1688 PO against locked supplier SKU; save 1688 order id.
3. On ship: fill tracking on sales platform; update **履约单**.
4. Watch SLA: warn before promised delivery buffer is burned.
5. Exceptions (OOS, price up, bad address, customs): follow G5 → human options.

## Agent constraints

- Do not substitute a different 1688 SKU without user approval.
- Status vocabulary: `待采 | 已采 | 已发 | 异常`.
- Prefer checklist updates over narrative.

## Done when

履约单 row updated with tracking or clear 异常 + next action.
