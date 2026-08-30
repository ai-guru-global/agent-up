---
target: GTM 页面 impeccable 审计
total_score: 27
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 3
timestamp: 2026-08-29T15-28-35Z
slug: gtm-website-index-html
---
# Critique snapshot — GTM/website/index.html (2026-08-26)

Method: dual-agent (A: critique-A · B: critique-B)
Score: 27/32 (84%, Good). n/a: 7, 10.
Cognitive load: 2/8 failures (line-length, hero focal competition) = moderate.

## Priority issues
- P0 演示凭据明文上页（allengaller/123）→ harden
- P1 全部 CTA 死锚点，无目的无成功态 → shape
- P1 .fdesc 行宽 90-124 字符 → typeset (cap 62ch)
- P1 对比度不达 AA：白字橙底 2.9:1、橙字纸底 2.7:1 → polish (深 burnt orange 交互面；文本橙 #C24E00)
- P2 移动端导航消失无替代 → layout
- P2 10.5px 功能文字 ×9 → polish (≥11-12px)
- P2 移动端隐藏环图 → adapt (紧凑静态 SVG 环)
- P3 h1 <br> 脆弱 / footer 内部黑话 / 无 :focus-visible

## Strengths
闭环环图自研 hero 视觉；MOCK/LIVE 诚实徽标；对比表先定义 baseline。

## Detector corroboration / false positives
佐证：line-length ×3、low-contrast ×4、undersized-ui-text ×9。
误报：overused-font(Fraunces)、cream-palette、marquee、side-tab（brief wins，保留）。

## Persona red flags
Jordan: 工程指标不答业务价值、死 CTA、无安抚。Riley: 明文密码反噬工程纪律叙事。Casey: 无导航、环图消失、facts 2×2 显乱。
