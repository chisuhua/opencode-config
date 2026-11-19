# e2e 层「证据纪律」测试 — 记录（2026-11-19）

> 落点：`rdd-workflow-e2e` 的 `tests/integration/test_evidence_discipline.bats`（**23 例**，零模型，默认进 CI）。
> 触发：用户指令「根据本会话的历史与工具调用教训创建 e2e 测试；若证明还会出错，就立项修到全绿」。
> 结论：**证明会**——7 类错误里有 4 类在**真实历史快照**上变红；剩下 3 类用反例证明判别力。
> 配套：本仓的 `tests/verify_record_discipline.sh`（同源 7 条判据，进提交门）= `openspec/changes/archive/2026-11-19-record-discipline-guards/`。

## 1. 7 条判据 ↔ 本会话的真实错误

| # | 判据 | 对应事故 |
|---|---|---|
| C1 | 标「逐字」的 AC 字面量必须在该 AC **声称的语料**里命中（排除 change 自身目录） | AC5 写「测试源码含 `git log -1 --format=%H --`（逐字）」，而参数写成数组后该字符串永不出现 ⇒ 判据不可满足 |
| C2 | `- [x] AC…` 必须有证据指针 | `required-question-hard-pause-probe` 的 AC5 勾了没落（CHANGELOG）；`subagent-contract-critic-enforce` 的镜像 15 条全未勾 |
| C3 | 勘误块必须含权威源 + 原文位置 | `N 112 → 326（≥150 已到）` 在两份文件里"互相印证"；追加载勘误后仍需可复核 |
| C4 | 观察报告 pending 与已确认并存 ⇒ 必须有取代标注 | 我读了报告 §1 的「载体 pending」，据此给出**错误的"不归档理由"**（§8.4 已写「载体 A 确认」） |
| C5 | `docs/adr/**` / `.rddf/improvements/**` 的 change 指针不悬空 | 归档后活文档指针需同步 |
| C6 | 含提交语境的「未改/未碰/只碰/只改」必须给命令（**不接受 `git log`**） | 我用混装 commit（`9cc67c9` 含 `prompts/build.md`）证明"没碰 prompts" |
| C7 | 「门槛已到」+150 的断言必须同 bullet 给取数指针 | `docs/CHANGELOG.md:72` 的「≥150 已到」没有任何取数指针 ⇒ 错误无人能复核 |

## 2. 判别力反证（**关键证据**，不是"现在绿"）

用 `git archive` 导出历史快照，`EVIDENCE_EPOCH=1970-01-01` 关掉保鲜期后跑同一套测试：

| 快照 | 含义 | 结果 |
|---|---|---|
| `0ff7f81` | 本会话**起点** | **C1、C2、C3、C4、C7 红**（5 条）；C5/C6 绿（那时还没归档动作/错误归因） |
| `ed6fd44` | AC10④ 的实施提交（AC5 仍写着坏字面量） | 同上 + **C1 精确点名** `config-guards-ac10-timeout-flake/proposal.md` |
| 当前 HEAD | 修复后 | **23/23 绿** |

⇒ 这说明这些测试**不是事后诸葛**：把状态退回出错当时，它们会红。

## 3. 写这套测试时我自己又犯的 4 个错（meta 教训）

`bats` 的「反例用例」把我的错误当场抓出来了 —— 值得记下来，因为它们和主教训同型：

1. **`printf` 把夹具文本当格式串**：fixture 里有 `%H` ⇒ `printf: 'H': invalid format character` ⇒ 夹具写坏、C1 反例恒绿。**修**：夹具一律 `cat <<'EOF'`。
2. **`grep -rlF -- "$lit" --include=…`**：`--` 之后的 `--include` 被当成文件名 ⇒ 语料限制**完全失效**（于是 C1 能被一份 `.md` 满足）。**修**：`grep -rlF "${inc[@]}" -e "$lit"`。
3. **判据自匹配**：守卫自己（`--selftest` 夹具、或 `TARGET_REPO` 里的副本）含有被判的字面量 ⇒ 自己满足自己。**修**：排除守卫自身文件；快照回归时脚本必须**同名**放置。
4. **`TOUCHED` 空转**：`mktemp` 建了空文件 ⇒ `[[ -n $TOUCHED ]]` 成立 ⇒ 所有文件"未改动"⇒ **7 条判据全部跳过、假绿**。**修**：非 git 目录视为"全部新"，并加 `SEEN==0 ⇒ 红` 的空转保护。

5. **bats 的用例名会被求值**：`@test "… `commit-gate.json` …"` 里的反引号在 bats 里被当命令执行
   （用例名渲染成空、stderr 冒 `commit-gate: command not found`）。**修**：用例名不写反引号。
   与第 3 条同型 —— 判据/描述的文本本身被执行。

⇒ 第 3、4 条正好是主教训（"判据匹配自身"/"空转即假绿"）在新层的复现。

## 4. 残留（不在测试里，也别假装在）

- **行为层**（agent 是否真的会这样写）**没有**被测：那要真实模型 + 额度（本机 `E2E_REAL_RUNTIME` 默认关闭，`E2E_BED_DIR` 未设）。本套只覆盖**产物层**。
- **「PATH shim 不可行」这类物理前提**不可能靠产物判据测出来 —— 只能靠"先写 3 行探针"的作业纪律（本会话的教训 §5），属人工层。
- 关掉保鲜期时，2026-11-18 的存量 change 会报出 `9\t2` 这类奇怪 span（提取启发式的噪声）⇒ 默认配置不可见，登记不修。

## 5. 怎么跑

```bash
# e2e 层（零模型，23 例）
cd /workspace/main/rdd-workflow-e2e
bats tests/integration/test_evidence_discipline.bats

# 历史快照回归（会红 ⇒ 证明判别力）
git -C ~/.config/opencode archive 0ff7f81 | tar -x -C /tmp/opencode/prefix-start
TARGET_REPO=/tmp/opencode/prefix-start EVIDENCE_EPOCH=1970-01-01 \
  bats tests/integration/test_evidence_discipline.bats

# 提交门层（本仓，同源 7 条）
cd ~/.config/opencode
bash tests/verify_record_discipline.sh
bash tests/verify_record_discipline.sh --selftest
```
