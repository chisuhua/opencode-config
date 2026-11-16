# 验收报告 — oracle-governance-scope-declaration

> 角色：verifier（只验不改）。判据来源（按优先级）：
> ① 用户指令「切过去验收」；② `openspec/changes/oracle-governance-scope-declaration/proposal.md`
> 的「## 验收标准」（AC1a–AC6）+「## Acceptance（勾选镜像）」；③ 本次 commit 的声明（`d00fe40`）。
> 分流：`.rddf/state/iteration.json` 不存在 ⇒ P3 archive gate 未触发；`rddf rdd-verify --dry-run`
> → `No eligible changes` ⇒ **走本地验收 1–5 步**（非 `rdd-verifier` skill 路径）。
> 任务完成度（本地验收额外门）：`openspec/changes/.../tasks.md` **26/26** 已勾选。

## 1. 验证顺序与结果

| 步 | 项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 静态 / 单测 | `bun test tests/config-guards.test.ts` | **109 pass / 0 fail**（1600 expect） |
| 1 | 全量单测 | `bun test tests/` | **594 pass / 0 fail**（10 文件，2994 expect） |
| 1 | change 校验 | `openspec validate oracle-governance-scope-declaration --strict` | **valid** |
| 3 | e2e 默认态（零模型，进 CI） | `bats tests/integration/test_oracle_intent_gate.bats`（e2e 仓） | **2 pass + 4 skip，exit 0** |
| 3 | e2e E-A（真模型） | `OIG_CARRIER=A OIG_CASE_TIMEOUT=600 OIG_MODEL=commandcode/… E2E_REAL_RUNTIME=1 bats --filter 'AC2'` | **ok**（判定行=`判定: REJECT`；`SC_SRC=a005b9d`，**无 `+dirty`**） |
| 3 | e2e AC5b（真模型，观察） | 同上 `--filter 'AC5b'` | **ok**（态①标注 0 次 / 态②标注 1 次；词表两态 `other`） |
| 4 | 边界 / 错误路径 | 见 §2 AC5c / AC4 突变 / 清扫 | 通过（见下） |
| 5 | 遗留清扫复核 | `grep TODO/FIXME/已删` + skip 检查 + e2e 工作树 | 通过（见 §3） |

> ⚠ 说明：E-A / AC5b 的**真模型**跑的是**已提交的 HEAD `a005b9d`**（`prompts/oracle.md` /
> `prompts/build.md` 工作树干净 ⇒ `SC_SRC` 列无 `+dirty`）。这比 builder 阶段那次（对 dirty 工作树）
> 更强：验证的是**提交态**，不是未提交改动。

## 2. 逐条判定（AC1a–AC6）

| AC | 判定 | 工具证据 |
|---|---|---|
| **AC1a** 四层表 + 猜测分支已删 | **PASS** | `grep -c '判定对象属治理面' prompts/oracle.md` → **0**；`grep -E '^\| [1-4] \|'` → 4 行，层号与判别词**同行**（1/2 声明、3「作用域表」、4 未声明+前缀条件）；词表字面在 `:48` **表格外**且未转义（`grep -c '治理面判定: PASS \\| BLOCK'` → 0） |
| **AC1b** verdict 段硬条件 | **PASS** | `prompts/build.md:539`：`治理面审查的判定行必须是 `治理面判定:`` + 「判定行以 `判定:` 开头」+ 标注串 + **同句**「⇒ 不得收口」+「这不是第三态 —— 与上一条同属『审查不成立』」 |
| **AC2** 调用方义务 + 后端/前端口径 | **PASS** | 治理面行（`grep '^\| `architect`（**治理面**）'`）含 `审查域: 治理面`（1 命中）；检查点小节含「被派发后端缺声明 ⇒ **不 block**」+「与 v2.37 …**口径差异有据**」+「`front` / `plan` 不需声明」 |
| **AC3** description 指针 | **PASS** | `JSON.parse(opencode.jsonc).agent.oracle.description`：含 `审查域` ✓ / 含 `prompts/oracle.md` ✓ / **不含**词表字面 `治理面判定: PASS` ✓（未复制正文） |
| **AC4** 守卫 + 突变 + 既有断言未改 | **PASS** | 新族 `describe("oracle 审查域声明（v2.40）")` 有 **17 条突变**（`expectCls` 18 行 − type 定义 1）且全部必须红（用例通过）；既有断言文本 `:1127/:1132` **原样**；`git diff a4ea85b HEAD -U0 -- tests/config-guards.test.ts` 的 hunk 只有 `2793`（replace→replaceAll）与 `2936+`（未覆盖清单 + 新族）⇒ **1125–1137 区间未被改**；未覆盖清单 7 条如实登记 |
| **AC5a** e2e 加声明可达门禁形态 | **PASS** | 真模型跑通；直接读产物 `.tmp-oig/ea.call1.txt:13` → `判定: REJECT`；报告行记录 `SC_SRC /home/ubuntu/.config/opencode (a005b9d)` |
| **AC5b** 两态观察如实登记 | **PASS（观察项，不 fail）** | 报告 §AC5b：态①（带声明）词表 `other` / 标注 **no**；态②（删声明）词表 `other` / 标注 **yes** ⇒ 词表不变但**声明被识别**；已注明 N=1 采样局限 |
| **AC5c** 三档 skip 纪律 | **PASS** | 代码三档齐：`provider.rate-limit|rate_limit|insufficient_quota` → skip；`rc == 124` → skip；「未产生 subagent 调用」→ skip。实测命中过：`provider.rate-limit`（报告 §1.1）+ 父会话超时（本轮 bats 输出「父会话超时（本用例未判定）」） |
| **AC6** 全绿 + validate + 投影 + CHANGELOG | **PASS** | `bun test tests/` 594 pass；`openspec validate` valid；`grep -c 审查域` → MD 1 / ORCH 1 / CHANGELOG 2；MD/ORCH **只写词表名**（既有「单一真源」断言 `:1129-1134` 绿） |

## 3. 遗留清扫复核（verifier 第 5 步）

| 项 | 结果 | 证据 |
|---|---|---|
| 新代码里的 TODO / FIXME | 无（`prompts/oracle.md` 0 命中） | `grep -rn "TODO\|FIXME" prompts/oracle.md` |
| 半截实现 / 注释掉的代码 | 无（`或判定对象属治理面` 已彻底删除，非注释） | `grep -c` → 0 |
| 临时调试日志 | 无（测试文件无 `console.log`） | `grep console.log tests/config-guards.test.ts` |
| 被 skip 的测试 | 无（`test.skip` / `describe.skip` 0 命中） | `grep -rn 'test.skip\|describe.skip' tests/` |
| 未替换的 mock | 无（守卫用真实文件读取，无 mock） | 代码结构 |
| 临时 fallback 分支 | 无 | — |
| e2e 仓工作树残留 | 干净（scratch 已 gitignore） | `git -C /workspace/main/rdd-workflow-e2e status --short` → 空 |

## 4. 失败项 / 路由建议

**无失败项** ⇒ 无需路由回 builder，无需 `rddf feedback`。

## 5. 已知限制（如实登记，不构成失败）

- **行为层样本量**：AC5b 是 N=1，**不可归因**（只登记、不 fail，与上游 E-B 同型）。
- **静态守卫的固有粒度**：猜测分支按单短语锚点（等价措辞可逃逸）、投影只钉存在性、
  「不得收口」token 检查在段内多处出现时删一处不红 —— 均已写入 v2.40 族未覆盖清单。
- **上游 change 未完整**：`oracle-intent-gate-e2e` 仍 22/28（AC7-② 需 hermetic HOME；
  AC5b 采样局限）—— 不属本 change 的验收范围，已在 backlog P2-4 登记。

## 6. 预算

- 已用轮次：**1 / 3**（`RDDF_VERIFIER_MAX_LOOPS` 对齐）。本轮一次通过。
