---
revision_count: 0
last_feedback_id: null
last_feedback_at: null
feedback_status: none
---

# commit-gate-force-push-heredoc — 强推口径补 `+refspec`/`--mirror` + heredoc 预处理改单遍跨行引号 + 命令词引用/转义还原

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 决策真源：`docs/adr/ADR-commit-verification-gate.md` **Rev 2 / 2.1 / Rev 3**（Status `Accepted`；Rev 2 经 oracle 1 + 复审 1 + critic 1，Rev 3 经 oracle 1，均无 BLOCKER）。
> 逐轮处置：`.rddf/reviews/commit-verification-gate-review.md` §7（Rev 2）+ §8（Rev 3，待誊写）。
> ⚠ 本改进**不新增决策** —— 决策全部在 ADR；本文只写**实施切分**、**判定表**与验收映射。

## Why

ADR 收口后 D9 表留着三个「无缓解」项，本改进实施它们。三个都属同一类病：**门禁对 shell 语义的还原不完整 ⇒ 宣称闭合而实际仍开着**。

| # | 缺口 | 实测证据 | ADR 落点 |
|---|---|---|---|
| ① | **强推只认标志** | `detectForcePush` 对 `+main` / `--mirror` / `--mirro` / `"+main"` / `"--force"` 全 `false` | D4 / D9⑬（Rev 2） |
| ② | **heredoc 预处理逐行** | `bash -c "line1⏎<<'EOF'⏎" ; git commit -m x` ⇒ 真实 bash **执行第二段**，门禁判 `isCommit: false` | D5 第 0 步 / D9⑫（Rev 2） |
| ③ | **命令词的引用 / 转义未还原**（规划期新发现，用户裁决并入本批） | `g\it commit -m x` / `$'git' commit -m x` / `$"git" commit -m x` / `git c\ommit -m x` ⇒ 真实 bash **都执行 git**，门禁全判 `false` | D5③ / D9⑮（Rev 3） |
| ④ | **push-gate 不剥离 heredoc**（规划期实测新发现） | heredoc 正文里的强推字面量被当成真命令 ⇒ **误拒**（fail-closed，非漏洞）；本批规划期即被它误伤过一次 | 实施对齐（两门禁共用同一前处理） |

⇒ 三条都要**可证伪**：每条配**变红演练**（突变 → 必红的断言）+ **证据包**（突变描述 / 红输出 / 复原 / 复跑全绿）。

## What Changes

> 顺序 = **层 1b 用例先行（含变红）→ 实现 → 守卫 → 文档**（不是排期，是取「红」的顺序）。

### A. 命令词还原（`lib/commit-gate.ts::tokenizeCommand`）—— ADR Rev 3，**最先做**

1. **词值还原规则（bash 语义，唯一真源）**：

   | # | 规则 | 例 | 还原后词值 |
   |---|---|---|---|
   | R1 | 引号外 `\` 转义下一个字符，**不产生分隔** | `g\it` | `git` |
   | R2 | `\` 转义**空格** ⇒ 仍是**一个**词 | `git\ commit` | `git commit`（**不是** git） |
   | R3 | `$` 紧跟 `'` / `"` ⇒ 按该引用处理，`$` **不进**词值 | `$'git'` / `$"git"` | `git` |
   | R4 | 单引号内 `\` **全字面** | `'a\b'` | `a\b` |
   | R5 | 双引号内 `\"` `\\` 转义 | `"a\"b"` | `a"b` |
   | R6 | 引号可**跨行** | `"a`⏎`b"` | `a`⏎`b` |

   ⚠ **还原只改「词值」，不改 `quoted` / `leadingQuote`**（它们描述源码形态，形态闭口依赖它们）。
   ⚠ 「是不是 `git`」与「子命令是不是 `commit`」**一律用还原后的词值** ⇒ `git c\ommit` ⇒ 子命令 `commit`。
   ⚠ **不在本批**：ANSI-C 转义序列表（`$'\x67it'`）与参数展开（`$CMD commit`）⇒ 登记 D9⑮。

### B. 强推谓词（`lib/commit-gate.ts` → `lib/push-gate.ts`）—— ADR Rev 2 / 2.1

2. **签名契约（钉死，避免实施者各写一版）**：

   ```ts
   /** 从 tokens[from] 起（from = `push` 子命令 token 的下标）扫描强推指示符。 */
   export function scanForcePush(tokens: Token[], from: number): {
     hit: boolean
     kind?: "long" | "short-cluster" | "plus-refspec"
     token?: string
   }
   ```
   - **替换** `isForceFlagToken`（**不留别名** ⇒ 不留第二真源）；同步 `lib/push-gate.ts` 的 import 与 `tests/push-gate.test.ts`。
   - `detectForcePush`（顶层命令词）与 `mentionsCommitOrForcePush`（D5⑪ 字符串侧）**调用同一 helper** ⇒ 两处口径自动一致。

3. **判定表**：

   | # | 规则 | 命中 | **不**命中（必须放行） |
   |---|---|---|---|
   | S1 | 长选项**前缀** | `--force*` / `--mirror*`（`=` 前部分） | `--no-force-with-lease` / `--tags` |
   | S2 | 短选项**逐字母**解析（遇带值短选项即停） | `-f` / `-uf` | `-u` / `-t` / `-o` |
   | S3 | **前导 `+`** 的 refspec | `+main` / `+a:b` | `main` / `main:main` / `:old`（删除类，D9⑭） |
   | S4 | **quoted 不跳过**（shell 去引号后即真身） | `"+main"` / `"--force"` / `"git" push` / `git "push"` | — |
   | S5 | **跳带值选项的值**（`-o` / `--push-option` / `--receive-pack` / `--exec` / `--repo`） | — | `git push -o +ci origin main` / `--push-option=+ci` |

   ⚠ S2 的**附着值**：`git push -oquickfix origin main`（`-o` 的附着值含 `f`）**不得**被当强推 ⇒ 短选项要**逐字母**解析（`o` 吃掉其后所有字符）。
   ⚠ S5 的**分离值与等号形态都要覆盖**（同 D5④ 口径）；等号形态（`--push-option=+ci`）不以 `+` 开头 ⇒ 天然安全，但仍按同一规则处理。
   ⚠ **全局选项在 `push` 前**（`git -c k=v push +main` / `git --no-pager push +main`）⇒ 定位 `push` 子命令时按 D5④ 跳过全局选项及其值。

### C. heredoc 预处理（`lib/commit-gate.ts::stripHeredocs`）—— ADR Rev 2 / 2.1

4. 改**单遍扫描**（引号状态跨行），并满足**输出契约（6 条不变式）**：

   | # | 不变式 |
   |---|---|
   | H1 | 只有**引号外**的 `<<`（且不是 `<<<`）才是候选标记 |
   | H2 | 候选标记**所在行必须引号平衡**（行末引号状态为空）⇒ 否则不是标记（bash 语义：命令行未完成 ⇒ heredoc 未开始） |
   | H3 | **标记本身**删除，**标记行其余部分逐字保留**（含 `&&` 尾部与重定向） |
   | H4 | **正文行与终止行整行删除**（不留空行 ⇒ 段数计数不受影响） |
   | H5 | 终止行判定与 bash 一致：普通 `<<` **整行相等**；`<<-` 去掉**前导 tab** 后相等；未找到终止行 ⇒ 按 bash 吞到串尾 |
   | H6 | 输出仍是「可再次 tokenize 的命令串」 |

   ⚠ **两个方向相反的边界，别混**（metis 抓到的我的措辞错误）：跨行引号 ⇒ **过度剥离 ⇒ 隐藏真命令 ⇒ fail-open**（已实证）；
   终止行判定过宽 ⇒ **提前终止 ⇒ 剩余正文被当命令 ⇒ 误拒（fail-closed）**。本批只修前者，并把后者按 H5 收紧。

### D. config + 守卫（**治理面**）

5. `opencode.jsonc` build shell 段增 **4 条** `deny`：`git push +*` / `git push * +*` / `git push --mirror*` / `git push * --mirror*`，
   置于 `git push *` = `ask` **之后**（last-match-wins）；`git commit*` = `allow`、`git push *` = `ask` 不变。
6. ⚠ **`opencode.jsonc` 是符号链接**（→ `opencode.jsonc.opencode-go`）⇒ 必须**编辑链接目标**，`readlink opencode.jsonc` 仍须指向它，
   `git diff --summary` **不得**出现 mode 变化（否则真源断裂而测试全绿）。
7. **「四形态」字样的全部落点**（实测枚举，实施时**逐处**改，勿只改一处）：

   | 文件 | 位置 |
   |---|---|
   | `opencode.jsonc.opencode-go` | build shell 段（+4 条 deny） |
   | `tests/config-guards.test.ts` | `:80` 注释 / `:83` 用例名 / `:90` 注释 / `:116` MAD 文案锚 = **字样落点**；`:91` 断言循环 = **改动点** |
   | `lib/push-gate.ts` | `:9` 头注 |
   | `tests/push-gate.test.ts` | `:4` 头注 / `:10` describe 名 |
   | `docs/MULTI-AGENT-DESIGN.md` | `:10` 页首变更说明 / `:725` / `:727` / `:861` |
   | `docs/CHANGELOG.md` | `:1063`（§4.7.4 的描述）⇒ 新节里改口径 |

   （`.rddf/reviews/**` 里的历史记述**不改** —— 那是过程记录。）

### D2. push-gate 与 commit-gate 的 **heredoc 前处理对齐**（AC9）

- `lib/push-gate.ts::detectForcePush` **不剥离 heredoc** ⇒ 正文里的强推字面量被当成真命令 ⇒ **误拒**（fail-closed）。
- **修法**：`stripHeredocs` 从 `lib/commit-gate.ts` **导出**并被 push-gate 复用 ⇒ 两个门禁对「什么是命令」的认知一致。

### E. 文档 + 元数据回填（**治理面** / **arch**）

8. `docs/MULTI-AGENT-DESIGN.md` §4.4.1 形态清单 + §4.4.3「必须列全**D4 定义的全部形态**（8 条）」；`docs/CHANGELOG.md` 新增一节，
   并把 **`--force-with-lease` 也被拒**（前缀匹配的顺带收紧，ADR D4 已写「有意为之」）作为**用户可感知的行为变化**写明。
9. **ADR 元数据回填**（`docs/adr/ADR-commit-verification-gate.md`）：`关联 change` ⇒ 指本 change；`AC 映射` ⇒ V1→AC6、V13–V17→AC1–AC5、V18→AC0；
   `Verification` 的复选框按**实施结果**勾选。⚠ 只回填**指针与勾选**，**不改任何决策文字**（要改 ⇒ 交回 architect）。
10. ⚠ **能力面投影不变**：`prompts/build.md` 的 `<!-- capability:build -->` 块**不得动**（`capabilityBlock()` 是**定性**派生：ask>0 且 deny>0 ⇒ 仍是 `allow-ask-and-deny`）⇒ 新增 4 条 deny **不**改分类。

### F. 层 2 归因（V17）

11. 真宿主实测 `git push origin +main` ⇒ **记录命中层**（宿主权限错 / `push-gate:` 文案）。
    ⚠ 宿主 glob 能否**跨空格**匹配中缀（`git push * +*`）**无源码锚点** ⇒ config 层是 **best-effort**、工具层才是权威
    ⇒ **禁止**在任何文案里写「config 已覆盖 `+refspec`」。

### G. 元规则（防「实施期顺手扩口径」）

12. 实施期**新发现**的形态 ⇒ 一律登记到 proposal 的 **Out of Scope + backlog**，
    **不得**顺手改口径（「本 change 不新增任何决策」不得被静默破坏）；若新发现**必须**改决策才能修 ⇒ **停下交回 architect**（`design_drift`）。

## Acceptance

> 逐条对应 ADR 的 V 项（**V18 → AC0**，因 tokenizer 还原是 V13–V15 所依赖的同一份引号/转义规则 ⇒ 先行实施）。

| AC | 判据 | 类型 | 来源 |
|---|---|---|---|
| AC0 | `"git" commit -m x` / `g\it commit -m x` / `$'git' commit -m x` / `$"git" commit -m x` / `git c\ommit -m x` ⇒ **被识别为 commit**；`git\ commit -m x`（词值 `git commit`，bash 不执行）⇒ **不得**被识别；`git commit -m 'a\b'` / `-m "a\\b"` ⇒ 放行；`echo a\ b` ⇒ 仍是**一个** token | 行为 | V18 |
| AC1 | `bash -c "line1\n<<'EOF'\n" ; git commit -m x` ⇒ **拒**，且理由是「单独成段 / 解释器闭口」**而非**「暂存区为空」（**层 1b** 判 `block` 文本；层 2 仅佐证） | 行为 | V13 |
| AC2a | `git commit -F - <<'MSG' … MSG` ⇒ **放行**；正文含 `git commit` 且段首 `bash x.sh` ⇒ **不拦**；标记行尾部逐字保留 | 行为 | V14 |
| AC2b | `git commit -F - <<'MSG' && git push --force origin main` ⇒ **拒**（理由 = 单独成段；**不是**「放行」） | 行为 | V14 |
| AC3 | 跨行引号合法提交 `git commit -m "a\nb"` ⇒ **放行**；`"bash" -c …` ⇒ 仍拒；**含 `<<` 的跨行引号**串 ⇒ 按 AC1 判（不得漏判） | 行为 | V15 |
| AC4 | 拒：`git push origin +main` / `+a:b` / `--mirror` / `--mirro` / `"+main"` / `"--force"` / `"git" push +main` / `git "push" --force` / `git -c k=v push +main` / `bash -c "git push -uf origin main"`；放行：`git push -o +ci origin main` / `-o+ci` / `-oquickfix origin main` / `--push-option=+ci` / `--receive-pack +x` / `--exec +x` / `--repo +x` / `bash -c "git push -o +ci origin main"` / `--no-force-with-lease` / `--tags` / `-u origin main` / `origin main` / **删除类** `git push origin :old` / `--delete old` / `-d old` / `--prune` | 行为 | V16 |
| AC5 | 层 2：`git push origin +main` 被拒时**记录命中层**（模板：命令原文 / 命中层 / 原始报错首行 / 结论只允许写「工具层权威、config best-effort」）；**非阻塞**，但记录缺失 ⇒ 交付不合格 | 行为 | V17 |
| AC6 | config 侧 **8 条** `deny` 全部存在且值 = `deny`；**4 条新增位于 `git push *` 之后**（`indexOf` 断言）；`git push *` 仍 `ask`、`git commit*` 仍 `allow`；D 表列出的**全部落点**已同步（含 `config-guards` 的 `:116` MAD 文案锚） | 结构 | V1 |
| AC7 | 回归：`bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 绿；`openspec validate commit-gate-force-push-heredoc --strict` valid（**依赖 `.openspec.yaml` 前置 —— planner 写集不含该文件 ⇒ builder 建**）；「四形态 / 四种形态」grep 排除本 change 自身 + `.rddf/reviews/**` + `docs/adr/**`（史实引用）⇒ 剩余命中为空 | 结构 | — |
| AC9 | `lib/push-gate.ts` 复用 `stripHeredocs` ⇒ heredoc 正文含强推字面量 ⇒ **不拦**；正文之外的真实强推 ⇒ 仍**拒** | 行为 | — |
| AC8 | **证据包**：每条变红演练留下「突变描述 + 突变后失败的测试名与断言原文 + 复原后复跑全绿」三件套，落 `.rddf/reviews/commit-gate-force-push-heredoc-mutations.md` | 结构 | — |

**AC 的「取红 / 钉住」分档**（⚠ **基线实测**：AC2a / AC2b / AC3 改动前**已绿** ⇒ 是**回归钉住**，不是取红点；
真·取红点 = **AC0 / AC1 / AC4 / AC9**）。

**变红演练**（一子规则一行，见 proposal 的同名表；缺一行 ⇒ 该子规则无判别力）。

## Capabilities

| 能力 | 状态 | 证据（哪条 AC / 哪个文件） |
|---|---|---|
| 工具层拦顶层 + 复合 + 换仓 + 解释器形态的 `git commit` | ✅ 已有（Rev 1） | 本批**不扩大** commit 判定面，只改**词值还原**与**预处理** |
| 工具层拦 force push（标志形态） | ✅ 已有（Rev 1） | AC4（补齐四类缺口后） |
| config 层把 force push 表达为 `deny` | ✅ 已有（Rev 1，4 条） | AC6（扩到 8 条；⚠ 跨空格 glob 无源码锚点 ⇒ best-effort） |
| 拦「heredoc 正文里的 `git commit` 字面量」被误当命令 | ✅ 已有（Rev 1） | AC2a（钉住，防回归） |
| 拦「跨行引号里的 `<<` 被误当 heredoc 标记 ⇒ 吞掉真命令」 | ❌ **本批补** | AC1 |
| 拦「`git push` 的 refspec / 选项值被误当强推标志」 | ❌ **本批补** | AC4 |
| 拦「命令词被引用 / 转义包裹 ⇒ 认不出是 git」 | ❌ **本批补** | AC0 |
| 拦「参数展开 / ANSI-C 转义表产生的命令词」 | ❌ **不做** | ADR **D9⑮**（诚实登记） |
| 拦「heredoc 正文里的强推字面量被当成真命令」（误拒方向） | ❌ **本批补** | AC9 |

## Impact

- **代码**：`lib/commit-gate.ts`（tokenizer 词值还原 + `stripHeredocs` + 强推 helper）、`lib/push-gate.ts`（删 `if (t.quoted) continue` + 复用 helper + 头注）。
- **配置 / 守卫**：`opencode.jsonc.opencode-go`（+4 条 deny，**符号链接**）、`tests/config-guards.test.ts`（断言 4 → 8 + 顺序断言）。
- **测试**：`tests/commit-gate.test.ts`（AC0/AC1/AC2a/AC2b/AC3）、`tests/push-gate.test.ts`（AC4；**须翻转**现存的 `+main` 允许用例）。
- **文档**：`docs/MULTI-AGENT-DESIGN.md`、`docs/CHANGELOG.md`、ADR 元数据回填。
- **审查面**：本批触及 **arch**（ADR Rev 3 已签批）+ **治理面**（config / 守卫 / 主题文档）⇒ 实施批的治理面改动须走 `审查域: 治理面` 的 oracle → critic。
- **回滚**：ADR D4 / D5 的「回滚路径」三步同批（config 4 条 + 谓词新增分支 + `stripHeredocs` 与 tokenizer 还原**一并**复原），**不可只退一半**。

## Feedback

（暂无）
