# 验收报告 — record-discipline-guards

> 判据来源：`openspec/changes/record-discipline-guards/proposal.md` 的 AC1–AC7。
> 角色：verifier（只验不改）。
> 已用轮次：**1**。
> 关联：`.rddf/reviews/evidence-discipline-e2e.md`（e2e 层的 7 条判据与历史快照回归）、e2e 仓 `tests/integration/test_evidence_discipline.bats`（22 例）。

## 1. 逐条判定

| AC | 判定 | 证据（命令 + 输出摘要） |
|---|---|---|
| AC1 | ✅ | `bash tests/verify_record_discipline.sh` ⇒ `RESULT: OK（记录纪律 7 条判据全部通过；保鲜期 2026-11-19）`，exit 0，耗时 **4.5s** |
| AC2 | ✅ | `grep -c '^check_c[1-7]' tests/verify_record_discipline.sh` ⇒ **7**；`bash tests/verify_record_discipline.sh --selftest` ⇒ **14 项全过**（7 反例被报出 + 7 正例不误报），末尾 `自测通过` |
| AC3 | ✅ | `bun test tests/` ⇒ **924 pass / 0 fail**（新增 2 例：`record-discipline.test.ts`）；套件总时长 24.8s |
| AC4 | ✅ | 历史快照回归（`RECORD_EPOCH=1970-01-01`，把脚本副本放进快照跑）：**C1** @`ed6fd44` 红（精确点名 `config-guards-ac10-timeout-flake/proposal.md` 的「逐字」AC）；**C2** @`0ff7f81`/`ed6fd44` 红（`required-question-hard-pause-probe` 勾选无证据）；**C4** @`0ff7f81` 红（`oracle-intent-gate-e2e-observation.md` 的未标注过期段）；**C7** @`0ff7f81` 红（`docs/CHANGELOG.md:72` 的「≥150 已到」无取数指针）。两快照 `exit=1`，当前仓 `exit=0` |
| AC5 | ✅ | 保鲜期生效：当前仓 31 个归档 change 中 2026-11-19 之前的存量**零报告**（对比：同脚本在快照上关掉保鲜期会报出 `2026-11-13`/`2026-11-18` 的存量） |
| AC6 | ✅ | e2e 仓 `bats tests/integration/test_evidence_discipline.bats` ⇒ **23/23 ok**（归档后因 C6 谓词收紧补 1 例，原 22；见 §6）（快照回归未关时才是红；当前仓绿） |
| AC7 | ✅ | `bash scripts/check-upstream-anchors.sh` ⇒ `RESULT: OK（23/23）`；`.rddf/commit-gate.json` 的 `verify_commands` **未改**（仍是 `bun test tests/` + anchors）——新判据经 wrapper 自动进入该命令 |

## 2. 失败项

无。

## 3. 遗留清扫

| 项 | 结果 |
|---|---|
| TODO / FIXME | 0 |
| 被 skip 的测试 | 0（新增 2 例均为实跑） |
| 临时脚本/调试日志 | 无（`/tmp/opencode` 下的探针未入库） |
| 第四态（入库但无人执行） | **已消除**——`.sh` 经 `record-discipline.test.ts` 包进 `bun test tests/` |

## 4. 如实登记的边界

1. **C1 的语料判定启发式**：语料由 AC 行的措辞决定（「测试源码/源码」⇒ 代码文件；「文档/报告/prompt」⇒ md；否则全语料）。措辞换一种说法（如「实现里」）会落回全语料 ⇒ 判据变弱（**不会假红**）。
2. **C1 会提取出奇怪的字面量**：关掉保鲜期时，2026-11-18 的归档 change（`commit-gate-d9-three-place-registration`）里出现 `9\t2` 这类 span ⇒ 报"找不到"。属**存量 + 关保鲜期**才可见（默认配置下不可见），登记不修。
3. **C3/C5/C6 没有历史快照回归**：它们的失败形态出现在本会话**之后**（勘误与指针是我当天补的），无对应快照 ⇒ 只用 `--selftest` 的反例证明判别力（Out of Scope ⑤）。
4. **C4 只看 `*-observation.md`**：`*-verify.md` 里的过期段不在范围内（当天没有该形态的事故）。
5. **保鲜期是有意的**：`RECORD_EPOCH=2026-11-19` 之前的存量不判红——本仓惯例是历史记述不回改，判红没有修复路径。要审存量：`RECORD_EPOCH=1970-01-01 bash tests/verify_record_discipline.sh`（会报存量，属诊断用途）。
6. **空转保护**：若扫描根为空 ⇒ 直接红（`SEEN==0`），避免"判据恒绿"——这条是当天在 e2e 仓里踩过的（`TOUCHED` 非空但为空文件 ⇒ 全部跳过 ⇒ 假绿）。
7. **C6 的「提交语境」不含文件名**：文件名 `commit-gate.json` 含 `commit` 但不是提交级归因 ⇒ 判定前先剔除该文件名（自测补了「配置文件名不算提交语境」正例）。该误报首次命中守卫**自己的验收报告**。
8. **C7 不区分「断言已到」与「描述该判据」**：判据描述行里引原话也会被触发 ⇒ 处置是**补精确位置指针**（如 `docs/CHANGELOG.md:72`），不放宽谓词。该形态首次命中 `evidence-discipline-e2e.md` 的判据表。
9. **`note_fail` 的消息文本不得带反引号包命令**：初版 C6 的失败消息写成 `` （`git log` 列不出…） `` ⇒ bash 在双引号里**真的执行了 `git log`**，把 6000+ 行灌进消息。已改纯文本（这也是「判据自身带副作用」的一例，与自匹配同型）。

## 5. 结论

**通过（7/7 AC）**，且**判别力经历史快照反证**（4/7 条在真实出错状态上变红）。可归档。

## 6. 归档后的两处追加（2026-11-19，不改判据口径，只修误报与补例）

1. **C6 的「提交语境」剔除文件名**：配置名 `commit-gate.json` 里含 `commit`，但「某个配置项保持原值」不是对提交文件集的陈述 ⇒ 判定前把该文件名替换掉再匹配。误报首次出现在本报告 AC7 行（**按文件归属**复核：那行只陈述配置保持原值，没有 git 归因）。同口径改动落在 `tests/verify_record_discipline.sh` 的 `check_c6` 与 e2e 的 `c6_unbacked_negative_claim`，两侧各补一条正例（e2e 用例 22 → **23**）。
2. **C7 判据描述行的指针化**：`.rddf/reviews/evidence-discipline-e2e.md` 的判据表引原话（"≥150 已到"）也会触发 C7 ⇒ **补精确位置** `docs/CHANGELOG.md:72`，**不放宽谓词**（放宽会让真正的无指针断言漏过去）。

两处都是「守卫命中自己的产物」——与原教训同型，故如实登记而不静默改口径。
