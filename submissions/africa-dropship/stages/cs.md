# Stage F — AI 客服

## Goal

Reply fast on routine intents; escalate money/dispute cases.

## Steps

1. Classify intent: `物流 | 尺码规格 | 使用方法 | 退换 | 投诉退款 | 其他`.
2. Route:
   - 物流 / 尺码规格 / 使用方法 → short answer from listing specs + tracking facts
   - 退换 → policy steps; escalate if unclear or high value
   - 投诉退款 → **human** (draft suggested reply only)
3. Answer in buyer’s language; keep tone factual and calm.
4. Log: order_id, intent, resolved/escalated.

## Agent constraints

- Never invent tracking scans or delivery dates.
- Never promise refund/compensation unless user/policy says so.
- If facts missing (no tracking, no policy), ask for the minimum missing field — then stop or escalate.
- Prefer 3–6 sentence replies unless user wants templates batch-generated.

## Suggested reply shape

```
1) Acknowledge issue
2) Fact from order/listing
3) Next step + timeline
4) Ask only if blocked
```

## Done when

Intent tagged + reply draft or escalation note ready.
