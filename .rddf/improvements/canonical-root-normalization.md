# improvement: canonical-root-normalization

## Why

`lib/delegate-core.ts` 的 `canonicalRoot()` 用 `git rev-parse --show-toplevel` 算 `canonical_root`，这个值同时决定三件事：`pair.json`/`role.json`/`ledger.jsonl` 的落盘位置、`git status` 差集的执行目录、`scope` 相对路径的解析基准。

而 `prompts/build.md:195,199` 要求角色状态按「`git rev-parse --git-common-dir` 归一」解析。两处口径不一致，且**不一致的那一处是真 bug**：

实测三种 git 场景（探针 P4）：

| 场景 | `--show-toplevel` | abs `--git-common-dir` | `--show-superproject-working-tree` |
|---|---|---|---|
| 主仓 | `/…/main` | `/…/main/.git` | 空 |
| **linked worktree** | `/…/wt` | **`/…/main/.git`** | 空 |
| **submodule 工作树** | `/…/super/vendor/sub` | **`/…/super/.git/modules/vendor/sub`** | **`/…/super`** |

- **linked worktree 下**：`pair.json`/`role.json`/`ledger.jsonl` 全部落进 **worktree 工作树副本**，主仓看不到。而 build agent 按主仓路径读 `role.json` 就**读不到自己那份** ⇒ 两份状态文件物理分裂 ⇒ `delegate` 的 resume 校验（`lookupPair(root, sessionID)`）在主仓路径下**查无此条** ⇒ 明明在登记表里的 session 被拒续接。
- **submodule 下**：直接取 `dirname(--git-common-dir)` 会得到 `.git/modules/vendor` 这种**非工作区路径** ⇒ 状态文件落进 git 内部目录。

且这不是孤立的路径问题：`git status` 若在主仓跑，**数不到 worktree 里的变更** ⇒ `artifacts` 恒为 0 ⇒ `ADR-delegate-delivery-evidence` 的 `no_work_evidence` 判定**系统性误报** `unverified`（本该有产物却报"无可验证交付"）。这是 worktree 场景的**必然结果**，不是边缘形态。

ADR `docs/adr/ADR-canonical-root-normalization.md` 已 Accepted（oracle + critic 双审，0 BLOCKER）。

## What Changes

- **`canonicalRoot()` 返回两个根**：`stateRoot`（状态文件落点，canonical 归一）+ `workRoot`（变更检测与 scope 解析的工作区）+ `vcs` 标志。签名变更（公开导出符号）⇒ 既有单测同步。
- **归一判别式**：`stateRoot = superproject 非空 ? superproject : dirname(abs(--git-common-dir))`；`workRoot = abs(--show-toplevel)`。abs 用 `git rev-parse --path-format=absolute --git-common-dir`（git ≥ 2.31；本机 2.43 实测可用）。**必须先判 superproject**（否则 submodule 下写到 `.git/modules/`）。
- **三个用途分别绑定**：pair/role/ledger → stateRoot；`git status` 差集 + `scope` 解析 → workRoot。
- **resume 校验双值接受**：既接受 stateRoot 也接受 workRoot（存量 pair.json 存的是归一前的 worktree 路径），新登记条目**只写 stateRoot**。安全边界：workRoot 恒为真实 git toplevel ⇒ **跨仓冒充不成立**，放宽的只是同仓内的路径变体。
- **不写迁移脚本**：pair.json 每工程一份且通常被 gitignore；遍历所有工程 worktree 的收益远小于误改运行时状态的风险。D3 的双值接受已覆盖存量。

**非 worktree 场景零行为变化**（`dirname(abs(--git-common-dir)) == abs(--show-toplevel)`）——这是本篇不惊动既有部署的关键。

## Acceptance

见 `openspec/changes/canonical-root-normalization/proposal.md` 的 `## 验收标准`（AC1–AC18）。**编号以 proposal 的 `## 验收标准` 为唯一源**，本段只列选型。

**最小可验收集合**（缺一即不通过）：AC1（主仓零行为变化）、AC2（worktree 下 pair.json 落主仓）、AC3（worktree 内 artifacts > 0）、AC4（submodule 归一到 superproject）、AC8（读回退）、AC9（双值接受）、AC7（git 版本回退路径）、AC13（跨仓冒充不成立）。

**否决条件**：① 最小集合里任一 AC 有工具证据表明失败；② 非 worktree 场景出现行为变化（既有部署被惊动）；③ 从非原 worktree 位置 resume 存量条目**被伪装成成功**（AC10 的失败方向必须如实失败）。

## Capabilities

- worktree / submodule 场景下状态文件不再分裂，resume 恢复可用。
- 变更检测在正确的工作区执行，`artifacts` / `no_work_evidence` 的判定恢复可信。
- 非 worktree 场景零行为变化，既有部署不受影响。

## Impact

- 影响面：`lib/delegate-core.ts`（`canonicalRoot` 返回值形状 + 其 6 处用途的根分派 + 可注入 `gitRunner`）、`tests/delegate-core.test.ts` / `tests/delegate-tool.test.ts`（canonical 相关用例 + 三种 git 场景）、`prompts/build.md`（**superproject 优先规则**，AC15/AC16 要求）、`docs/front-delegate-architecture.md`（§4.3 session 模型表的 canonical 口径）、`docs/dual-session-delegation.md`。
- 兼容性：`canonicalRoot()` 是**公开导出符号**，返回形状变更（一个值 → 两个根）⇒ 既有单测必须同步改。`pair.json` schema **不变**（`canonical_root` 字段仍是字符串，只是取值口径变严 + 读回退）。
- ✅ **归属已裁定**：`prompts/build.md` 归 **builder 实施**（用户 2026-11-09 明确）。AC15/AC16 的文档部分由本 change 一并落地。
- 风险：`--path-format=absolute` 需 git ≥ 2.31（回退路径须显式实现，且裸 `--git-common-dir` 在主仓返回相对路径 `.git`，回退必须以调用 cwd 为基准）；`--show-superproject-working-tree` 的空串语义若被上游改掉，判别式会误判（必须先判空再判路径）；`.git` 为文件（非目录）的 submodule 形态未实测；**ADR D3 的"双值接受已覆盖存量"论证不完整**（需读回退，待 architect 补正）。
