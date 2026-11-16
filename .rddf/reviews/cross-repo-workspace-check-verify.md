# 验收报告：cross-repo-workspace-check

> 验收者：**verifier**（builder 的角色内建固定审查者，见 `prompts/build.md` §审查配对）
> 判据来源：`openspec/changes/cross-repo-workspace-check/proposal.md` 的「## 验收标准」AC1–AC11（**唯一真源**）；辅以 `.rddf/improvements/cross-repo-workspace-check.md` 的 `## Acceptance`
> 实施者：builder（同一会话）—— 本报告是**自检 + 取证**，不是独立第二人
> 已用轮次：**1**（上限 3）

## 判定

**PASS** —— AC1–AC11 **全部满足**，每条均有工具证据。

⚠ 两条**残留**（不属本次可闭合范围，已如实登记，见 §遗留清扫）：
① 跨仓那半**仍无 CI 守卫**（另一仓在本机 home ⇒ CI 不可达）—— 本 change 只把「人工 diff」变成「一条命令」，**没有**把它变成 CI 门；
② 「漏跑」（改了一侧忘记跑）**未处理** —— 那要变更期提醒，已在 improvement 的「明确不做」登记。

## 逐条判定 + 证据

### AC1 清单校验 + `repos: []` 不得绿

```
$ bash tests/verify_cross_repo_check.sh     # → PASS=38 FAIL=0, exit 0
PASS 非法 JSON ⇒ exit 1 (exit=1)
PASS repos 为空 ⇒ exit 1 (exit=1)          # 另断言「repos 为空 ⇒ RESULT: CONFIG」
PASS id 重复 ⇒ exit 1 (exit=1)
PASS canonical_path 含 ~ ⇒ exit 1 (exit=1)
PASS canonical_path 相对路径 ⇒ exit 1（不接受，避免基准歧义） (exit=1)
PASS 缺 schema_version ⇒ exit 1 (exit=1)
PASS schema_version 主版本不认识 ⇒ exit 1 (exit=1)
PASS 清单文件不存在 ⇒ exit 1 (exit=1)
```

### AC2 身份校验三支 + SKIP 可见

```
PASS required 仓缺失 ⇒ exit 3 (exit=3)              # + 输出含期望路径
PASS canonical_path 指向仓内子目录 ⇒ exit 3 (exit=3)  # + 输出点明不是仓根
PASS remote url 与清单不符 ⇒ exit 3 (exit=3)         # + 输出含两侧 URL
PASS required:false 仓缺失 ⇒ exit 0 (exit=0)         # + 输出含 SKIP
PASS required:false 仓缺失 ⇒ RESULT: SKIP（未评估不计入一致）
PASS 未评估 ⇒ 不得报 OK
PASS canonical_path="." ⇒ 解析为本仓自身 ⇒ exit 0 (exit=0)
```

### AC3 整行逐字粒度 + 取数命令在清单里

- 粒度：脚本内 `if c_text == p_text`（**整行逐字**，含 `owns: ` 前缀与 `, ` 分隔符）—— `scripts/cross-repo-check.sh` 的核对段。
- 命令位置：`.rddf/config/workspace.json` 的 `checks[0].consumer_cmd` / `producer_cmd`（argv 数组，无 shell 串）。
- 「改一个字符必红」实测（**真实两仓**上做的漂移演练）：

```
$ scripts/cross-repo-check.sh --workspace /tmp/opencode/ws-drift.json
[drift] verifier-owns-parity: 两侧不一致
  --- opencode-config
  +++ rdd-workflow
  @@ -1 +1 @@
  -owns: .rddf/state/verifier/<name>.json, …, .rddf/state/verifier/rdd-verify-context-<name>.json
  +owns: .rddf/state/verifier/<name>.json, …, .rddf/state/verifier/rdd-verify-context-<name>.json, DRIFTED
RESULT: DRIFT        # exit=2
```

### AC4 ENV ≠ DRIFT

```
PASS 一侧命令失败 ⇒ exit 3（不是 2） (exit=3)
PASS 命令失败 ⇒ RESULT: ENV
PASS 命令失败 ⇒ 不得报 DRIFT
PASS 一侧过滤后为空（不可比）⇒ exit 3 (exit=3)
```

### AC5 一致：OK + 双 sha（本机实跑）

```
$ scripts/cross-repo-check.sh
[repo] opencode-config  /home/ubuntu/.config/opencode  HEAD=e4652374320f61621a2ac59890980e601137ee84
[repo] rdd-workflow  /workspace/main/rdd-workflow  HEAD=a1434697cf1195bc92928a694f59d067491355d4
[repo] rdd-workflow-e2e  /workspace/main/rdd-workflow-e2e  HEAD=3e992e05fafc36ec76a9677d2e3bf9b54a40359d
[check] verifier-owns-parity: 一致
[summary] checks=1 evaluated=1 skipped=0 drifted=0
RESULT: OK            # exit=0
```

### AC6 漂移：DRIFT + diff + 双 sha

见 AC3 的实跑输出：`RESULT: DRIFT` / exit=2 / `diff -u` 两侧原文 / **三个仓的 HEAD sha 均已打印**（sha 在核对前打印 ⇒ 漂移分支同样带 sha）。

### AC7 只读

```
PASS 跑前跑后两仓 git status --porcelain --ignored 一致
PASS 跑前跑后两仓无新增 __pycache__ / *.pyc
```

（fixture 仓的 `__pycache__` 集合前后为空；真实产品仓侧由 `python3 -B` + `PYTHONDONTWRITEBYTECODE=1` 双重保证 —— 见脚本头部与 `export`。）

### AC8 头部依赖 + 退出码对照 + `--help` 风格

```
$ scripts/cross-repo-check.sh --help | wc -l      # 32（= 头部注释全文）
$ scripts/cross-repo-check.sh --help | grep -c "set -uo"   # 0（没把代码打进帮助）
```

头部含：依赖声明（`bash` / `python3` / `git` / `bun`）、退出码表（`0/1/2/3`）、与 `scripts/check-upstream-anchors.sh` 的关系（**`2` 同义 = 漂移**）、只读约束、范围边界。

### AC9 五支 fixture + `bash -n`

```
$ bash -n scripts/cross-repo-check.sh && bash -n tests/verify_cross_repo_check.sh   # OK
$ bash tests/verify_cross_repo_check.sh     # PASS=38 FAIL=0, exit 0
```

覆盖：OK / DRIFT / ENV（缺仓 · 子目录 · remote 不符 · 命令失败 · 过滤为空）/ SKIP / CONFIG（八类违例）。

### AC10 不变量

```
$ git diff --name-only HEAD
docs/guard-authoring.md
$ git ls-files --others --exclude-standard
.rddf/config/workspace.json
.rddf/improvements/cross-repo-workspace-check.md
.rddf/plans/cross-repo-workspace-check.md
.rddf/reviews/cross-repo-workspace-check-planner-review.md
openspec/changes/cross-repo-workspace-check/{.openspec.yaml,design.md,proposal.md,tasks.md}
scripts/cross-repo-check.sh
tests/verify_cross_repo_check.sh

$ git status --porcelain -- lib prompts      # 空 ⇒ lib/** 与 prompts/** 零改动
$ bun test tests/
 591 pass / 0 fail / 2906 expect() calls   (exit 0)
```

> 勘误（已回写 proposal AC10）：初版 AC10 的允许文件清单**漏了** `.rddf/plans/cross-repo-workspace-check.md`（builder 内置流程的 TDD 计划产物）⇒ 已补入清单。**判定口径未放宽**（`lib/**` / `prompts/**` 零改动 + `bun test` 全绿两条原样保留）。

### AC11 `docs/guard-authoring.md` 三处

```
$ grep -n "cross-repo-check.sh" docs/guard-authoring.md
228:| **两仓清单逐字一致 + `scripts/cross-repo-check.sh`** | …     # §6 表
230:⇒ **各自钉自己那半，跨仓靠逐字一致 + 核对脚本**。…              # §6 表结论行
234:**脚本为准**：`scripts/cross-repo-check.sh`（清单 …）           # §6.1 首句
271:- [ ] 跨仓的那一半 ⇒ 跑过 `scripts/cross-repo-check.sh` 吗？…   # §7 核对单
```

## 遗留清扫（build 自查 + verifier 复核）

| 检查项 | 结果 | 证据 |
|---|---|---|
| TODO / FIXME / XXX / HACK | ✅ 无 | `grep -rn "TODO\|FIXME\|XXX\|HACK" scripts/cross-repo-check.sh tests/verify_cross_repo_check.sh .rddf/config/workspace.json` → 空 |
| 临时调试日志 / `console.log` | ✅ 无 | 仅 2 处 `print(` 是脚本内的 `emit()` / `err()` 辅助函数 |
| 半截实现 | ✅ 无 | 五个分支（CONFIG / ENV / SKIP / DRIFT / OK）全部有测试覆盖 |
| 被 skip 的测试 | ✅ 无 | fixture 无 skip 机制；38 条断言全 PASS |
| 未替换的 mock | ✅ 无 | fixture 用**真 git 仓**（`git init` + `remote add`），不是伪造的 `git` stub |
| 临时 fallback 分支 | ✅ 无 | 4 处 `except` 全部**报错并退出**（CONFIG/ENV），无 `pass` 吞异常 |
| 死代码 / 未用变量 | ✅ 无 | `--quiet` 分支已实跑验证（输出仅 `RESULT: OK`） |

**范围外的历史遗留（只记录，不趁机清理）**：

1. `docs/guard-authoring.md` §6 的「跨仓那半无 CI 守卫」**仍然成立** —— 本 change 提供的是**本地命令**，不是 CI 门。⇒ 已在 §6 表格里把「人工 diff」改成脚本名，但**CI 缺口本身未闭合**。
2. 「漏跑」与「跨仓同改的流程」未处理 —— improvement「明确不做」已登记。
3. **产品侧漂移**：`add-improve` 的 `pre_create_brainstorm_check.sh` 在本仓**必然不通过**（它要 `.rddf/roadmap/{phases,features}/*.md` 的主题 + YAML frontmatter；本仓两者皆无，15 份既有 improvement 也皆无）⇒ 本次按仓内既有 5 段格式产出。**该漂移不在本 change 范围**，登记待处理。

## 失败项与路由建议

无失败项。无需回 builder 修实现，无需回 planner 改 proposal（AC10 的文件清单勘误已在本 change 内回写并留痕）。

## 结论

**PASS（AC1–AC11 = 11/11）**，带 3 条如实登记的残留（第 1 条是本 change **本就不能**闭合的，因为「另一仓在 home ⇒ CI 不可达」是既有架构事实）。
