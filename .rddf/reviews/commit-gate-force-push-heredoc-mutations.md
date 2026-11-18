# commit-gate-force-push-heredoc —— 变红演练证据包（AC8）

> 形态：**临时突变 → 跑目标测试 → 记录红 → 复原 → 复跑全量**（每次都复原 ⇒ 工作树无残留）。
> 判据来源：`openspec/changes/commit-gate-force-push-heredoc/proposal.md`（**已归档** 2026-11-18 ⇒ `openspec/changes/archive/2026-11-18-commit-gate-force-push-heredoc/proposal.md`）「变红演练」表（一子规则一行）。

| # | 突变 | 目标测试 | 实跑（红） | 必红的用例 |
|---|---|---|---|---|
| A-R1/R3 | 删掉 tokenizer 的「引号外反斜杠转义」与「`$'…'` 前缀还原」两个分支（`lib/commit-gate.ts`） | `tests/commit-gate.test.ts` | ✅ 变红 | (fail) V18 命令词的引用 / 转义还原（ADR Rev 3 D5③） > 识别为 commit：g\it commit -m x [0.74ms]; (fail) V18 命令词的引用 / 转义还原（ADR Rev 3 D5③） > 识别为 commit：git c\ommit -m x [10.75ms]; (fail) V18 命令词的引用 / 转义还原（ADR Rev 3 D5③） > `echo a\ b` ⇒ 仍是一个 token（还原不得把词切开） [10.78ms] |
| A-R2 | 把「转义下一个字符」改成「转义字符当分隔符」（先切词再剥转义的潦草实现）（`lib/commit-gate.ts`） | `tests/commit-gate.test.ts` | ✅ 变红 | (fail) V18 命令词的引用 / 转义还原（ADR Rev 3 D5③） > 识别为 commit：g\it commit -m x [0.51ms]; (fail) V18 命令词的引用 / 转义还原（ADR Rev 3 D5③） > 识别为 commit：git c\ommit -m x [0.53ms]; (fail) V18 命令词的引用 / 转义还原（ADR Rev 3 D5③） > `git\ commit -m x`（转义空格 ⇒ 一个词 `git commit`，bash 不执行）⇒ 不得识别为 commit [ |
| B-S1 | 强推长选项改回**精确名集合**（⇒ 漏掉 git 允许的缩写 `--mirro`）（`lib/commit-gate.ts`） | `tests/push-gate.test.ts` | ✅ 变红 | (fail) D4 force push 六形态（工具层兜底 ⇒ 拒） > 拒：git push --mirro [39.85ms] |
| B-S2 | 短选项退回「含 f 即强推」（⇒ `-oquickfix` 的附着值含 f ⇒ 误判）（`lib/commit-gate.ts`） | `tests/push-gate.test.ts` | ✅ 变红 | (fail) 负向矩阵（不得误伤） > 放行：git push -oquickfix origin main [0.54ms] |
| B-S3 | 删掉「前导 `+` 的 refspec」分支（`lib/commit-gate.ts`） | `tests/push-gate.test.ts` | ✅ 变红 | (fail) D4 force push 六形态（工具层兜底 ⇒ 拒） > 拒：git push origin +main [0.59ms]; (fail) D4 force push 六形态（工具层兜底 ⇒ 拒） > 拒：git push origin "+main" [0.71ms]; (fail) D4 force push 六形态（工具层兜底 ⇒ 拒） > 拒："git" push +main [11.18ms] |
| B-S4 | 恢复「quoted token 跳过」（⇒ 带引号的强推形态放行）（`lib/commit-gate.ts`） | `tests/push-gate.test.ts` | ✅ 变红 | (fail) D4 force push 六形态（工具层兜底 ⇒ 拒） > 拒：git push origin "+main" [0.90ms] |
| B-S5 | 删掉「跳带值选项的值」（⇒ `git push -o +ci` 被误判成强推）（`lib/commit-gate.ts`） | `tests/push-gate.test.ts` | ✅ 变红 | (fail) 负向矩阵（不得误伤） > 放行：git push --push-option +ci origin main [1.18ms] |
| C-H1/H2 | 引号状态**不跨行**（逐行语义）⇒ 跨行引号里的 `<<` 被当真标记 ⇒ 吞掉真命令（`lib/commit-gate.ts`） | `tests/commit-gate.test.ts` | ✅ 变红 | (fail) V13–V15 heredoc 预处理（单遍 + 跨行引号） > AC1 跨行引号里的 `<<` 不是标记 ⇒ 真命令不得漏判 [11.09ms] |
| C-H3 | 把整个标记行删掉（而非只删标记本身）⇒ 标记行尾部的 `&& …` 丢失（`lib/commit-gate.ts`） | `tests/commit-gate.test.ts` | ✅ 变红 | (fail) V13–V15 heredoc 预处理（单遍 + 跨行引号） > AC2b 标记行尾部保留 ⇒ `&& git push --force` 仍参与判定（拒：单独成段） [1.21ms] |
| C-H4 | 不删正文（⇒ 正文里的 `git commit` 字面量被当命令）（`lib/commit-gate.ts`） | `tests/commit-gate.test.ts` | ✅ 变红 | (fail) V13–V15 heredoc 预处理（单遍 + 跨行引号） > AC2a 合法 heredoc 提交 ⇒ 放行 [0.62ms] |
| C-H5 | 终止行判定退回 `.trim()`（过宽 ⇒ 尾随空格的 `EOF ` 也终止 ⇒ 剩余正文被当命令）（`lib/commit-gate.ts`） | `tests/commit-gate.test.ts` | ✅ 变红 | (fail) V13–V15 heredoc 预处理（单遍 + 跨行引号） > H5 终止行判定与 bash 一致：普通 `<<` 要求整行相等（`EOF ` 尾随空格 ⇒ 不终止 ⇒ 其后正文仍是数据） [0.67ms |
| C-H2b | `scanLine` 的 `$'…'` 分支**多跳一格**（开引号不被跟踪 ⇒ 标记行被判成引号平衡）（`lib/commit-gate.ts`） | `tests/commit-gate.test.ts` | ✅ 变红 | (fail) V13–V15 heredoc 预处理（单遍 + 跨行引号） > 标记行尾部挂**未闭合 `$'…'`** ⇒ 命令行未完成 ⇒ `<<` 不是标记 ⇒ 真命令不得漏判 [1.04ms] |
| D-AC6 | config 只写 4 条 deny（删掉 Rev 2 的四条）⇒ 档位守卫必须红（`opencode.jsonc.opencode-go`） | `tests/config-guards.test.ts` | ✅ 变红 | (fail) 守卫漂移检测：配置 == 规则真源 > build 的 shell：`git commit` ⇒ allow（验证门接管）；`git push` ⇒ ask；force-push 八条 ⇒ deny [0. |

**复原后复跑全量**：`bun test tests/` ⇒ **877 pass / 0 fail**。

⚠ **口径**：本表只证明「每个子规则都有判别力」（改实现 ⇒ 对应用例必红）；
不证明「实现正确」——正确性由 `bun test tests/` 全绿 + 层 2 实测承担。
