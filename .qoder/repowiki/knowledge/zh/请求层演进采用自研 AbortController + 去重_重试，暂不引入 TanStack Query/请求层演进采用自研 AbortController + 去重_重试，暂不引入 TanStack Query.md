---
kind: design
name: 请求层演进采用自研 AbortController + 去重/重试，暂不引入 TanStack Query
source: session
category: adr
---

# 请求层演进采用自研 AbortController + 去重/重试，暂不引入 TanStack Query

_来源：7c359f6 → 2bdcd49 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
框架的 storeReq.ts 存在竞态、重复请求与失败重试等缺失；同时团队希望控制改造范围，避免在单一优化周期内引入外部库。

## 决策驱动
- 最小侵入（仅改动 storeReq.ts）
- 可控的改造范围
- 避免过早引入额外依赖

## 备选方案
- **方案 B：自研补齐竞态取消、请求去重、失败重试** — 优点：改动面小、完全可控、无需学习新库
- **方案 A：以 TanStack Query 作为 StoreReq 执行底座** _（已否决）_ — 优点：获得缓存与失效重验证能力；缺点：当前无多页签共享数据/缓存需求，属于过度设计；引入外部库增加维护成本

## 决策
先实施方案 B，在 storeReq.ts 内部补齐 AbortController 竞态治理、请求去重与失败重试；当出现真实的多页签共享数据或缓存/后台刷新需求时再评估切换至 TanStack Query。

## 影响
短期内请求治理能力由框架自行维护；若后续业务复杂度上升，需预留迁移到 TanStack Query 的接口边界。