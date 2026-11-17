# Tasks — required-question-hard-pause-probe

> 判据真源：`proposal.md`（AC1–AC5）。取舍：`design.md`（D1 为什么只勘 / D2 为什么不加判据 / D3 最小成本路线）。

## Task 1：先读（**零成本**，可能直接答完 Q2 / Q4）

- [x] **Step 1:** 读 `rdd-builder` skill 的 P0 / P2.5 段（`~/.agents/skills/rdd-workflow/skills/rdd-builder/SKILL.md` 或项目内副本）⇒ 答 **Q4**（是否已有非交互口径）
- [x] **Step 2:** 读 P0 的落盘逻辑（`.rddf/state/builder/<name>.json` 之类）⇒ 答 **Q2**（pause 是否落盘）
- [x] **Step 3:** 若 Q2 + Q4 已能推出「不会自行拍板 / 已有口径」⇒ **直接跳 Task 3**（写「无需改动」）

## Task 2：只在必要时真跑（**吃额度**）

- [ ] **Step 1:** 非交互跑一次 `rdd-builder`（P0 触发）⇒ 观察：停下 / 自行选 / 报错（**Q1**）
- [ ] **Step 2:** 若 P0 与 P2.5 行为可能不同 ⇒ 各跑一次（**Q3**）⚠ 成本翻倍 ⇒ 先用 Task 1 的读证判断是否必要

## Task 3：落结论

- [x] **Step 1:** 观察报告新增一节：Q1–Q5 逐条答案 + 证据来源（AC1）
- [x] **Step 2:** 有缺陷 ⇒ 设计草案（兜底形态 + 与状态机交互点 + 落盘/恢复）；无缺陷 ⇒ 如实写「无需改动」（AC2）
- [x] **Step 3:** 更新守卫「未覆盖清单」里 `rdd-builder` P0/P2.5 那一条（AC3）
- [x] **Step 4:** CHANGELOG（AC5）

## 审查（收口前）

- [ ] **R1:** 本 change **不改 prompts / skill**（AC4）⇒ 不触发治理面审查；**但**「设计草案」若含**拟改的 prompt 措辞** ⇒ 那部分按治理面审（oracle 1 轮即可）

## 已知边界

- 勘察结论**有时效性**（`rdd-builder` 实现变了就过时）⇒ 标注版本。
- 本 change **不修**任何行为 ⇒ 缺陷仍然存在（若勘察发现有缺陷）⇒ 实施是**后续 change**。
