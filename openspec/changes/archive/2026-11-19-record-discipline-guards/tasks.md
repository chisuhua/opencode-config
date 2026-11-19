# Tasks — record-discipline-guards

> 判据真源：`proposal.md` 的 AC1–AC7。同源实现与判别力证据：`.rddf/reviews/evidence-discipline-e2e.md`。
> 顺序说明：本 change 的判据先在 **e2e 仓**写成 bats（22 例）并用历史快照验证判别力，**之后**才把同源逻辑搬进本仓提交门 —— 避免「先写守卫再找用例」的自证式判据。

## T1：在 e2e 仓建立判据与判别力证据（AC6 的前半）

- [x] **S1:** `rdd-workflow-e2e/tests/integration/test_evidence_discipline.bats` 落 7 条判据（C1–C7），每条配「反例必报 + 正例不误报」
- [x] **S2:** 修掉测试自身 5 处 bug（C3 漏 `上条|本条`、C4 头部正则漏无括号标题、C2 未 strip 日期前缀、C6 把性质句误判、C6 误把 `git log` 当归因手段）
- [x] **S3:** 历史快照回归：`0ff7f81`（会话起点）/ `ed6fd44`（实施提交）上 C1/C2/C4/C7 **各红**，当前仓 22/22 绿（证据：`.rddf/reviews/evidence-discipline-e2e.md` §2）

## T2：搬进本仓提交门（AC1 / AC2 / AC3）

- [x] **S1:** `tests/verify_record_discipline.sh` —— 7 个 `check_cN` + `--selftest`（14 项：7 反例 + 7 正例）
- [x] **S2:** 保鲜期 `RECORD_EPOCH=2026-11-19`（一次 `git log --since` + 一次 `git status` 预计算，不逐文件跑 git）
- [x] **S3:** 空转保护（扫描根为空 ⇒ 直接红）+ 排除 `.git`/`node_modules` + 排除守卫自身（反自匹配）
- [x] **S4:** `tests/record-discipline.test.ts` —— 薄包装进 `bun test tests/`（消除「入库但无人执行」的第四态）

## T3：文档与落点（AC4 / AC5 / AC7）

- [x] **S1:** `tests/README.md` 覆盖表加一行
- [x] **S2:** `docs/test-authoring.md` §8 核对单补「记录类判据是否已进守卫」
- [x] **S3:** 验收报告 `.rddf/reviews/record-discipline-guards-verify.md`（AC1–AC7 逐条 + 边界登记）
- [x] **S4:** `bash scripts/check-upstream-anchors.sh` ⇒ 23/23；`.rddf/commit-gate.json` 未改（新判据经 wrapper 自动进入 `bun test tests/`）

## T4：验收（AC1–AC7 全跑一遍）

- [x] `bash tests/verify_record_discipline.sh` ⇒ exit 0
- [x] `bash tests/verify_record_discipline.sh --selftest` ⇒ 自测通过
- [x] `bun test tests/` ⇒ 924 pass / 0 fail
- [x] e2e 仓 `bats -r tests/` ⇒ 142 例 / 0 失败 / 68 skip（gated 运行时）/ exit 0

## 审查（收口前）

- [x] **R1:** 本 change 只动 `tests/**` + 两份文档；**未改** `prompts/**`、未改 `.rddf/config/**` 的规则、未改任何既有判据、未改 `tests/config-guards.test.ts` 的断言 ⇒ **不构成治理面改动** ⇒ 不触发 oracle/critic（口径见 `prompts/build.md` 的「不调 critic：纯执行改动（测试、脚本…）」）
- [x] **R2:** 未新增 ADR、未反转既有决策 ⇒ 无需 architect 路径
- [x] **R3:** `docs/CHANGELOG.md` 未改（与同类测试基础设施 change `real-repo-git-budget-guard` 一致：它也未改 CHANGELOG；CHANGELOG 记的是 agent 行为/权限的变更）
