# commit-gate-force-push-heredoc — 强推口径补 `+refspec`/`--mirror` + heredoc 预处理改单遍跨行引号 + 命令词引用/转义还原

> 判据真源：`docs/adr/ADR-commit-verification-gate.md` **Rev 2 / 2.1 / Rev 3**（Status `Accepted`）
> —— 本 change 是这些修订的**实施载体**，**不新增任何决策**。
> 决策取舍与宣称边界见该 ADR（D4 / D5③ / D5 第 0 步 / D9⑫⑬⑭⑮ / V1 / V13–V18）。
> 逐轮处置：`.rddf/reviews/commit-verification-gate-review.md` §7（Rev 2）+ §8（Rev 3）。
> ✅ ADR 已签批 ⇒ 可开工。本 change 的 AC 表 = ADR 的 V 项映射（**V18 → AC0**、V13–V17 → AC1–AC5、V1 → AC6）。

## Why

三个缺口同属一类病：**门禁对 shell 语义的还原不完整 ⇒ 宣称闭合而实际仍开着**。全部有本机实测证据。

| # | 缺口 | 实测 | ADR |
|---|---|---|---|
| ① | 强推只认标志 | `detectForcePush` 对 `+main` / `--mirror` / `--mirro` / `"+main"` / `"--force"` 全 `false` | D4 / D9⑬ |
| ② | heredoc 预处理逐行 | `bash -c "line1⏎<<'EOF'⏎" ; git commit -m x` ⇒ 真实 bash **执行第二段**，门禁判 `isCommit: false` | D5 第 0 步 / D9⑫ |
| ③ | 命令词引用 / 转义未还原（规划期新发现，用户裁决并入本批） | `g\it commit` / `$'git' commit` / `$"git" commit` / `git c\ommit` ⇒ 真实 bash **都执行 git**，门禁全判 `false` | D5③ / D9⑮ |

## What Changes

### A. 命令词还原（`lib/commit-gate.ts::tokenizeCommand`）—— **最先做**（AC0）

> ADR Rev 3：词值还原放在**源头**（tokenizer），不在比较处放宽 ⇒ 命令词定位 / 子命令解析 / 提交形态闭口 /
> D4 的 `detectForcePush` / D5⑪ 的 `mentionsCommitOrForcePush` **五处共用**，不产生第二真源。

**词值还原规则表（bash 语义，唯一真源）**

| # | 规则 | 输入 | 还原后词值 |
|---|---|---|---|
| R1 | 引号外 `\` 转义下一个字符，**不产生分隔** | `g\it` | `git` |
| R2 | `\` 转义**空格** ⇒ 仍是**一个**词 | `git\ commit` | `git commit`（**不是** git） |
| R3 | `$` 紧跟 `'` / `"` ⇒ 按该引用处理，`$` **不进**词值 | `$'git'` / `$"git"` | `git` |
| R4 | 单引号内 `\` **全字面** | `'a\b'` | `a\b` |
| R5 | 双引号内 `\"` `\\` 转义 | `"a\"b"` | `a"b` |
| R6 | 引号可**跨行** | `"a`⏎`b"` | `a`⏎`b` |

- 还原**只改词值**，**不改** `quoted` / `leadingQuote`（形态闭口依赖这两个标记）。
- 「是不是 `git`」与「子命令是不是 `commit`」**一律用还原后的词值** ⇒ `git c\ommit` ⇒ 子命令 `commit`。
- **不在本批**：ANSI-C 转义序列表（`$'\x67it'`）与参数展开（`$CMD commit`）⇒ 登记 D9⑮。

### B. 强推谓词（`lib/commit-gate.ts` → `lib/push-gate.ts`）—— AC4

**签名契约（钉死）**

```ts
/** 从 tokens[from] 起（from = `push` 子命令 token 的下标）扫描强推指示符。 */
export function scanForcePush(tokens: Token[], from: number): {
  hit: boolean
  kind?: "long" | "short-cluster" | "plus-refspec"
  token?: string
}
```

- **替换** `isForceFlagToken`（**不留别名** ⇒ 不留第二真源）；同步 `lib/push-gate.ts` 的 import 与 `tests/push-gate.test.ts`。
- `detectForcePush` 与 D5⑪ 的 `mentionsCommitOrForcePush` **调用同一 helper** ⇒ 两处口径自动一致。

**判定表**

| # | 规则 | 命中（拒） | **不**命中（放行） |
|---|---|---|---|
| S1 | 长选项**前缀**（`=` 前部分） | `--force*` / `--mirror*`（含缩写 `--mirro`） | `--no-force-with-lease` / `--tags` |
| S2 | 短选项**逐字母**解析（遇带值短选项即停） | `-f` / `-uf` | `-u` / `-t` / `-o` / `-oquickfix`（附着值含 `f` 也不误判） |
| S3 | **前导 `+`** 的 refspec | `+main` / `+a:b` | `main` / `main:main` / `:old`（删除类 ⇒ D9⑭） |
| S4 | **quoted 不跳过**（shell 去引号后即真身） | `"+main"` / `"--force"` / `"git" push` / `git "push"` | — |
| S4b | ⚠ **S4 横跨两层**：删除范围 = `lib/push-gate.ts` 的**三处** quoted 检查 —— `:71` 的 `if (t.quoted) continue`（**参数层**）＋ `:54` 的 `!t.quoted &&`（**git 命令词定位层**）＋ `:67` 的 `sub.quoted`（**子命令层**）；后两处现判放行 ⇒ 只删 `:71` 会在 AC4 的 `"git" push +main` / `git "push" --force` 上红 | — |
| S5 | **跳带值选项的值**（`-o` / `--push-option` / `--receive-pack` / `--exec` / `--repo`；分离值与等号形态都覆盖） | — | `-o +ci` / `-o+ci` / `--push-option=+ci` / `--receive-pack +x` / `--exec +x` / `--repo +x` |

- 定位 `push` 子命令时按 D5④ **跳过全局选项及其值**（`git -c k=v push +main` / `git --no-pager push +main`）。

### C. heredoc 预处理（`lib/commit-gate.ts::stripHeredocs`）—— AC1 / AC2a / AC2b / AC3

**输出契约（6 条不变式）**

| # | 不变式 |
|---|---|
| H1 | 只有**引号外**的 `<<`（且不是 `<<<`）才是候选标记 |
| H2 | 候选标记**所在行必须引号平衡**（行末引号状态为空）⇒ 否则不是标记（bash：命令行未完成 ⇒ heredoc 未开始） |
| H3 | **标记本身**删除，**标记行其余部分逐字保留**（含 `&&` 尾部与重定向） |
| H4 | **正文行与终止行整行删除**（不留空行 ⇒ 段数计数不受影响） |
| H5 | 终止行判定与 bash 一致：普通 `<<` **整行相等**；`<<-` 去掉**前导 tab** 后相等；未找到终止行 ⇒ 按 bash 吞到串尾 |
| H6 | 输出仍是「可再次 tokenize 的命令串」 |

⚠ **两个方向相反的边界，别混**：跨行引号 ⇒ **过度剥离 ⇒ 隐藏真命令 ⇒ fail-open**（本批修它，已实证）；
终止行判定过宽 ⇒ **提前终止 ⇒ 剩余正文被当命令 ⇒ 误拒（fail-closed）**（本批按 H5 收紧；⚠ 该 fail-closed 读法**以 H5 成立为前提** —— 若残余正文含**不平衡引号**，tokenizer 可能吞掉后续真命令 ⇒ 该路径由 H5 收紧消除，不是靠方向标签消除）。

### D2. push-gate 与 commit-gate 的 **heredoc 前处理对齐**（AC9）

- ⚠ **本批实测新发现**：`lib/push-gate.ts::detectForcePush` **不剥离 heredoc** ⇒ 正文里出现的强推字面量会被当成真命令
  ⇒ **误拒**（fail-closed 方向，**不是**漏洞）：例如「用 heredoc 写一段讲 force push 的文档」会被门禁拦下
  （本批规划期即被这条误伤过一次：写计划的 heredoc 正文含强推字面量 ⇒ 提交命令被拒）。
- **修法**：`stripHeredocs` 从 `lib/commit-gate.ts` **导出**并被 push-gate 复用（单一真源）⇒ 两个门禁对「什么是命令」的认知一致。
- **判据**：AC9 —— 「heredoc 正文含强推字面量 ⇒ **不拦**；正文**之外**的真实强推 ⇒ 仍**拒**」（层 1b，纯逻辑）。
- ⚠ **不改** ADR 决策文本（这是 Rev 2 「同一套规则」的实施对齐）⇒ 只在 plan 侧登记。

### D. config + 守卫（**治理面**）—— AC6

- ⚠ **开工前置（builder 创建）**：`openspec/changes/commit-gate-force-push-heredoc/.openspec.yaml`
  （`schema: spec-driven` + `created: 2026-11-18` + `skip_specs: true`，格式照 `role-aware-permissions`）
  —— ⚠ **planner 的写集只含 `proposal.md`**（工具层已拒写该文件）⇒ 由 builder 建；**未建前 `openspec validate --strict` 会红**（AC7 的前置）。
- `opencode.jsonc` build shell 段增 **4 条** `deny`：`git push +*` / `git push * +*` / `git push --mirror*` / `git push * --mirror*`，
  置于 `git push *` = `ask` **之后**（last-match-wins）；`git commit*` = `allow`、`git push *` = `ask` 不变。
- ⚠ **`opencode.jsonc` 是符号链接**（→ `opencode.jsonc.opencode-go`）⇒ 编辑**链接目标**；
  `readlink opencode.jsonc` 仍须指向它；`git diff --summary` **不得**出现 mode 变化。
- **「四形态」字样的全部落点**（逐处改，勿只改一处）：

  | 文件 | 位置 |
  |---|---|
  | `opencode.jsonc.opencode-go` | build shell 段（+4 条 deny） |
  | `tests/config-guards.test.ts` | `:80` 注释 / `:83` 用例名 / `:90` 注释 / `:116` MAD 文案锚 = **字样落点**；`:91` 断言循环 = **改动点**（本身不含「四形态」字样） |
  | `lib/push-gate.ts` | `:9` 头注 |
  | `tests/push-gate.test.ts` | `:4` 头注 / `:10` describe 名 |
  | `docs/MULTI-AGENT-DESIGN.md` | `:10` 页首 / `:725` / `:727` / `:861` |
  | `docs/CHANGELOG.md` | `:1063`（§4.7.4 的描述）⇒ 在新节里改口径 |

  （`.rddf/reviews/**` 的历史记述**不改** —— 那是过程记录。
  ⚠ **ADR 自身的两处「四形态」（`:80` 的「四形态 ⇒ 8 条」与 `:294` 的「Rev 1 四形态 + Rev 2 四形态」）= 史实引用 ⇒ 不改**
  —— 改它们等于改**决策文字** ⇒ 须交回 architect。）

### E. 文档 + 元数据回填 —— AC6 / AC7

- `docs/MULTI-AGENT-DESIGN.md` §4.4.1 形态清单 + §4.4.3「必须列全**D4 定义的全部形态**（8 条）」。
- `docs/CHANGELOG.md` 新增一节；并把 **`--force-with-lease` 也被拒**（前缀匹配的顺带收紧，ADR D4 写明「有意为之」）作为**用户可感知的行为变化**写明。
- **ADR 元数据回填**：`关联 change` ⇒ 指本 change；`AC 映射` ⇒ V1→AC6、V13–V17→AC1–AC5、V18→AC0；`Verification` 复选框按实施结果勾选。
  ⚠ 只回填**指针与勾选**，**不改任何决策文字**（要改 ⇒ 交回 architect）。
- ⚠ **能力面投影不变**：`prompts/build.md` 的 `<!-- capability:build -->` 块**不得动**（`capabilityBlock()` 是**定性**派生：ask>0 且 deny>0 ⇒ 仍是 `allow-ask-and-deny`）。

### F. 层 2 归因（AC5）

- 真宿主实测 `git push origin +main` ⇒ **记录命中层**（宿主权限错 / `push-gate:` 文案）。
- ⚠ 宿主 glob 能否**跨空格**匹配中缀（`git push * +*`）**无源码锚点** ⇒ config 层 **best-effort**、工具层才是权威
  ⇒ **禁止**在任何文案里写「config 已覆盖 `+refspec`」。

### G. 元规则（防「实施期顺手扩口径」）

- 实施期**新发现**的形态 ⇒ 登记到 **Out of Scope + backlog**，**不得**顺手改口径；
- 若新发现**必须**改决策才能修 ⇒ **停下交回 architect**（`design_drift`），不自行处置。

## 实施顺序（TDD：先取「红」）

1. **层 1b 用例先行**：AC0 / AC1 / AC2a / AC2b / AC3 / AC4 的用例（红）⇒ 记录红输出（证据包起点）。
2. **实现**：A（tokenizer 还原）→ B（强推 helper）→ C（heredoc 单遍）。
3. **守卫**：`tests/config-guards.test.ts`（8 条 + 顺序断言）+ `opencode.jsonc`（+4 条 deny）。
4. **文档**：`docs/MULTI-AGENT-DESIGN.md` / `docs/CHANGELOG.md` / ADR 元数据回填。
5. **变红演练**：逐条突变 ⇒ 记录红 ⇒ 复原 ⇒ 复跑全绿（AC8 证据包）。
6. **层 2**：AC5 归因实测 + AC1 的层 2 佐证。

## 验收标准

| AC | 判据 | 类型 | 来源 |
|---|---|---|---|
| AC0 | `"git" commit -m x` / `g\it commit -m x` / `$'git' commit -m x` / `$"git" commit -m x` / `git c\ommit -m x` ⇒ **被识别为 commit**；`git\ commit -m x`（词值 `git commit`，bash 不执行）⇒ **不得**被识别；`git commit -m 'a\b'` / `-m "a\\b"` ⇒ 放行；`echo a\ b` ⇒ 仍是**一个** token | 行为 | V18 |
| AC1 | `bash -c "line1\n<<'EOF'\n" ; git commit -m x` ⇒ **拒**，理由是「单独成段 / 解释器闭口」**而非**「暂存区为空」（**层 1b** 判 `block` 文本；层 2 仅佐证） | 行为 | V13 |
| AC2a | `git commit -F - <<'MSG' … MSG` ⇒ **放行**；正文含 `git commit` 且段首 `bash x.sh` ⇒ **不拦**；标记行尾部逐字保留 | 行为 | V14 |
| AC2b | `git commit -F - <<'MSG' && git push --force origin main` ⇒ **拒**（理由 = 单独成段；**不是**「放行」） | 行为 | V14 |
| AC3 | 跨行引号合法提交 `git commit -m "a\nb"` ⇒ **放行**；`"bash" -c …` ⇒ 仍拒；**含 `<<` 的跨行引号**串 ⇒ 按 AC1 判（不得漏判） | 行为 | V15 |
| AC4 | ⚠ **工具层口径**（config 层对「值以 `+` 开头的带值选项」有假阳性，见 D 段与 ADR D4）；拒：`git push origin +main` / `+a:b` / `--mirror` / `--mirro` / `"+main"` / `"--force"` / `"git" push +main` / `git "push" --force` / `git -c k=v push +main` / `bash -c "git push -uf origin main"`；放行：`git push -o +ci origin main` / `-o+ci` / `-oquickfix origin main` / `--push-option=+ci` / `--receive-pack +x` / `--exec +x` / `--repo +x` / `bash -c "git push -o +ci origin main"` / `--no-force-with-lease` / `--tags` / `-u origin main` / `origin main` / **删除类** `git push origin :old` / `--delete old` / `-d old` / `--prune` | 行为 | V16 |
| AC5 | 层 2：`git push origin +main` 被拒时**记录命中层**（模板：命令原文 / 命中层 / 原始报错首行 / 结论只允许写「工具层权威、config best-effort」）；**非阻塞**，但记录缺失 ⇒ 交付不合格 | 行为 | V17 |
| AC6 | config 侧 **8 条** `deny` 全部存在且值 = `deny`；**4 条新增位于 `git push *` 之后**（`indexOf` 断言）；`git push *` 仍 `ask`、`git commit*` 仍 `allow`；D 表列出的**全部落点**已同步（含 `config-guards` 的 `:116` MAD 文案锚） | 结构 | V1 |
| AC7 | 回归：`bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 绿；`openspec validate commit-gate-force-push-heredoc --strict` valid（**依赖 D 的 `.openspec.yaml` 前置**）；**grep 口径** = `grep -rnE "(force-?push|config)[^|]{0,30}四(种)?形态|四(种)?形态[^|]{0,30}(force-?push|config)" --include=*.md --include=*.ts .` **排除** `openspec/changes/commit-gate-force-push-heredoc/**`、`.rddf/improvements/commit-gate-force-push-heredoc.md`、`.rddf/reviews/**`（过程记录）、`docs/adr/**`（史实引用，见 D 表注）⇒ 剩余命中**必须为空**；⚠ **口径说明**：`lib/role-lease.ts` 的「AC21 四种形态」说的是**租约损坏形态**，与强推计数无关 ⇒ 不在本判据口径内；本 change **归档后**再复核一次（届时自身文件也进历史记述） | 结构 | — |
| AC9 | `lib/push-gate.ts` 复用 `stripHeredocs` ⇒ heredoc 正文含强推字面量 ⇒ **不拦**；正文之外的真实强推 ⇒ 仍**拒** | 行为 | — |
| AC8 | **证据包**：每条变红演练留下「突变描述 + 突变后失败的测试名与断言原文 + 复原后复跑全绿」三件套，落 `.rddf/reviews/commit-gate-force-push-heredoc-mutations.md` | 结构 | — |

**AC 的「取红 / 钉住」分档**（⚠ **基线实测**：改动前 AC2a / AC2b / AC3 **已经绿** —— 现行逐行 `stripHeredocs` 也满足它们；
它们是**回归钉住**（防实现改坏），**不是**取红点；只有 **AC0 / AC1 / AC4** 是真·取红点）：

| 分档 | AC | 说明 |
|---|---|---|
| 🔴 **取红**（改动前**红** ⇒ 改动后必须绿） | AC0（正向五形态 + `git\ commit` 负向）、AC1、AC4 | 这三条提供本批的**判别力** |
| 🟢 **钉住**（改动前**已绿** ⇒ 不得回归成红） | AC2a、AC2b、AC3 | 证据包按「钉住（改动前已绿）」记录，**不得**写成「红」 |

**变红演练（一子规则一行；缺一行 ⇒ 该子规则无判别力）**

| 子规则 | 突变点（文件:符号） | 必红的断言（测试名 + 断言原文） |
|---|---|---|
| A-R1/R3 词值还原 | `lib/commit-gate.ts::tokenizeCommand`（去掉引号外 `\` 与 `$` 前缀处理） | AC0 用例「`g\it commit -m x` ⇒ `isCommit === true`」 |
| A-R2 空格转义 | 同上（改成「先按空白切词、再剥转义」） | AC0 用例「`git\ commit -m x` ⇒ `isCommit === false`」 |
| B-S1 前缀匹配 | `lib/commit-gate.ts::scanForcePush`（改回精确名集合） | AC4 用例「`git push --mirro` ⇒ 拒」 |
| B-S2 短选项逐字母 | 同上（短选项退回「含 f 即强推」） | AC4 用例「`git push -oquickfix origin main` ⇒ 放行」 |
| B-S3 `+refspec` | 同上（删 `+` 分支） | AC4 用例「`git push origin +main` ⇒ 拒」 |
| B-S4 quoted | `lib/push-gate.ts`（恢复 `if (t.quoted) continue`） | AC4 用例「`git push "+main"` ⇒ 拒」 |
| B-S5 跳带值 | `lib/commit-gate.ts::scanForcePush`（删带值跳过） | AC4 用例「`git push -o +ci origin main` ⇒ 放行」 |
| C-H1/H2 跨行引号 | `lib/commit-gate.ts::stripHeredocs`（退回逐行 `findHeredocMarker`） | AC1 用例「`bash -c "line1\n<<'EOF'\n" ; git commit -m x` ⇒ `isCommit === true`」 |
| C-H3 标记行尾部 | 同上（删除整行而非只删标记） | AC2b 用例「`git commit -F - <<'MSG' && git push --force` ⇒ 拒（单独成段）」 |
| C-H4 正文删除 | 同上（不删正文） | AC2a 用例「正文含 `git commit` 且段首 `bash x.sh` ⇒ 不拦」 |
| C-H5 终止行判定 | 同上（终止行判定退回 `.trim()` —— 现行 `lib/commit-gate.ts:242` 即此实现，可直接当突变起点） | 用例「body 含 `EOF `（**尾随空格** ⇒ bash 不终止）且其后正文有 `git commit` 字面量 ⇒ **不拦**」 |
| C-H6 输出可再分词 | 同上（删除正文时把终止行与下一行**拼接**，不留换行） | 用例「heredoc 后紧跟一条合法提交 ⇒ 仍**被识别为 commit**（单段）」 |
| A-R4/R5 引号内转义 | `lib/commit-gate.ts::tokenizeCommand`（把单引号内 `\` 当转义） | AC0 用例「`git commit -m 'a\b'` ⇒ 放行」 |
| D-AC6 config 条数 | `opencode.jsonc.opencode-go`（只写 4 条 deny） | AC6 守卫断言「8 条 `deny` 全部存在」 |
| D-AC6 顺序 | 同上（把 4 条新增放在 `git push *` **之前**） | AC6 守卫断言「新增 deny 的 `indexOf` > `git push *` 的 `indexOf`」 |

## Out of Scope

- **删除类 push**（`--delete` / `-d` / `:refspec` / `--prune`）—— 用户裁决不纳入强推口径 ⇒ ADR **D9⑭**，仍落 `git push *` = `ask`。
- **命令行之外的强推**（`remote.<n>.push` 的 refspec 带 `+` / `remote.<n>.mirror=true`）—— 命令行看不到 ⇒ ADR **D9⑬**。
- **同行多个 heredoc**（`cat <<A <<B`）⇒ ADR **D9⑫**。
- **参数展开 / ANSI-C 转义表**（`$CMD commit` / `$'\x67it'`）⇒ ADR **D9⑮**。
- **`git "commit"` / `g\it "commit"`（引号包住的**子命令**）** —— `lib/commit-gate.ts::parseGitSubcommandIndex` 的 `sub.quoted` 检查 "
       "⇒ 判**不是** commit ⇒ 走 fail-closed **误拒**（bash 实际会执行 commit）⇒ 方向安全但**是 Rev 3 词值还原留下的未登记残余**；"
       "⇒ 本批**不扩**（登记即可）；⚠ **ADR 的 D9 应追加一条**（architect 动作，归档前补）。
- **shell 注释与非常规 delimiter**（`#` 注释里的 `<<` / `<<$X` / `<<\EOF` / `<<''`）—— 方向 = **误拒（fail-closed）**，登记为已知边界；**本批不实现**（若实施中出现 ⇒ 按元规则 G 登记，不自行扩口径）。
- **ADR 拆分**（正文 > 250 行上限，D5 的 11 步属「设计规格」而非决策）—— 另立 backlog，不在本 change。
- **形状计数三向一致守卫**（ADR 的 6 形状 ↔ config 8 条 ↔ 测试用例 ↔ MAD 文案）—— 本批用 AC6 的落点枚举替代，**独立守卫**另立 backlog。
- **e2e 仓的 E-8 判据重设计** —— 已在 e2e 仓登记（`935cf4e`），与本 change 无交集。
