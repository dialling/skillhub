# Stage B — 1688 寻源 / 同款

## Goal

Map each approved `sku_id` to a verified 1688 offer; pass **G2**.

## Steps

1. Search by image + keywords; keep ≥3 supplier options when possible.
2. Spec diff against planned listing: material, L/W/H, weight, accessories, color, pack-in.
3. Record unit price, MOQ, lead time, shipping from supplier region.
4. Pick primary + backup; mark 差异 explicitly (never hide mismatches).
5. Output **供应商映射表** ([templates.md](../templates.md)).
6. **Human checkpoint:** 同款确认.

## Agent constraints

- “Looks similar” ≠ same SKU. Any critical mismatch → 状态=差异, do not lock.
- Prefer suppliers with clear specs and stable restock over cheapest only.
- If user pastes 1688 links/screenshots, reconcile field-by-field.

## Done when

Primary 1688 link locked or blocked with listed diffs; backup noted.
