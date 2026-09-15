---
name: africa-dropship
description: >-
  Runs the Africa e-commerce dropship workflow: market research and product
  selection, 1688 sourcing match, volumetric freight/profit pricing, listing
  copy and images, order fulfillment, and AI customer-service routing. Use when
  the user mentions Africa market research, 选品, 竞品分析, 1688同款, 运费/体积重,
  主图/卖点/上架, 出单采购发货, or AI客服 for this pipeline.
---

# Africa Dropship Workflow

End-to-end pipeline for selling into Africa, sourcing from 1688.

## How to use this skill

1. Identify the **current stage** from the user request (or ask once if unclear).
2. Read only the matching reference file below — do not load all files.
3. Follow that stage's checklist, gates, and output template.
4. Stop at **human checkpoints** unless the user explicitly waives them.

| Stage | When | Read |
|-------|------|------|
| A 选品 | 调研、热销、选品、竞品 | [stages/select.md](stages/select.md) |
| B 寻源 | 1688、同款、供应商 | [stages/source.md](stages/source.md) |
| C 定价 | 长宽高、体积重、运费、利润 | [stages/price.md](stages/price.md) |
| D 内容上架 | 主图、卖点、简介、发布 | [stages/listing.md](stages/listing.md) |
| E 履约 | 出单、采购、发货、运单 | [stages/fulfill.md](stages/fulfill.md) |
| F 客服 | 回复、售后、退款、物流咨询 | [stages/cs.md](stages/cs.md) |
| 全流程 | 用户要 SOP / 端到端 | Run A→F in order; human gates between stages |

Shared hard gates and risk rules: [gates.md](gates.md)  
Output templates: [templates.md](templates.md)

## Pipeline (order)

```
选品(A) → 寻源(B) → 定价(C) → 内容上架(D) → 监控出单 → 履约(E) → 客服(F) → 复盘回 A
```

## Hard rules

- **Pricing math is code/table, not LLM estimates.** Use the user's freight sheet; never invent shipping rates.
- **Do not claim certifications, medical effects, or brand authorization** without user-provided proof.
- **Same-SKU mismatch is a blocker** — if 1688 specs ≠ listing specs, stop and flag.
- **Human checkpoints (default):** 选品终审、同款确认、首单定价复核、退款/投诉。
- Prefer structured tables over long prose. Every stage must end with a clear **输出物**.

## Full-flow progress checklist

Copy and update when running end-to-end:

```
- [ ] A 选品：候选池 + 可卖性闸门
- [ ] B 寻源：1688 映射 + 同款核对
- [ ] C 定价：体积重 + 运费表 + 利润达标
- [ ] D 上架：主图/文案/类目字段
- [ ] E 履约：采购 → 回填运单
- [ ] F 客服：意图分流话术/升级
```
