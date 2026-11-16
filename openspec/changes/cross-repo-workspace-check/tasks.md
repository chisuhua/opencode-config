# Tasks — cross-repo-workspace-check

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC11）。
> 决策取舍：`design.md`（D1 清单落点 / D2 清单声明式 / D3 路径口径 / D4 身份校验 / D5 四档出口码 / D6 整行逐字 / D7 只读 / D8 两层跳过 / D9 假仓 fixture / D10 出口码对齐）。
> 实施计划：`.rddf/plans/cross-repo-workspace-check.md`（TDD 5 步，先红后绿）。

**状态（2026-11-16）**：Task 1–5 全落 ⇒ 实施完成，待 verifier 验收。

---

## Task 1：核对器骨架 + 清单校验（CONFIG 档 / AC1）

- [x] **Step 1（红）**：`tests/verify_cross_repo_check.sh` 写「清单非法 ⇒ exit 1」五例（非法 JSON / `repos: []` / `id` 重复 / `canonical_path` 含 `~` / 相对路径 / 缺 `schema_version` / 主版本不认识 / 清单不存在），实跑确认红
- [x] **Step 2（绿）**：`scripts/cross-repo-check.sh` 的清单校验段（`python3` 读 JSON + 逐条判）+ `.rddf/config/workspace.json` 骨架
- [x] **Step 3（验）**：五例转绿；真实清单校验通过

## Task 2：仓身份校验（ENV / SKIP 档 / AC2）

- [x] **Step 1（红）**：「路径不存在 ⇒ 3」「`required:false` 缺失 ⇒ 0 + `SKIP` 行」「指向仓内子目录 ⇒ 3」「remote url 不符 ⇒ 3」四例，实跑确认红
- [x] **Step 2（绿）**：身份校验（`realpath == show-toplevel`；`remote.origin.url` 归一后比对；缺仓按 `required` 分流）
- [x] **Step 3（验）**：四例转绿

## Task 3：核对项比对（DRIFT / ENV 档 / AC3–AC6）

- [x] **Step 1（红）**：「两侧一致 ⇒ 0 + `RESULT: OK`」「两侧不同 ⇒ 2 + diff」「一侧命令失败 ⇒ 3（**不是 2**）」「过滤后为空 ⇒ 3」四例，实跑确认红
- [x] **Step 2（绿）**：两侧命令执行（argv，无 shell）+ 过滤 + 整行逐字比对 + 双仓 `HEAD` sha 打印
- [x] **Step 3（验）**：四例转绿

## Task 4：真实清单接上产品仓 + 端到端（AC5 / AC6）

- [x] **Step 1（红）**：用真实清单跑 ⇒ 期望 `RESULT: OK` + 两仓 sha（清单未声明核对项 ⇒ 红）
- [x] **Step 2（绿）**：清单声明 `verifier-owns-parity`（consumer = 本仓 `verifierWriteSetBlock()` 的 `owns:` 行；producer = 产品仓 `SKILL_OWNS_PATHS`）
- [x] **Step 3（验）**：真实跑 ⇒ `RESULT: OK` + 三仓 sha；临时篡改一侧 ⇒ 必红（exit 2）⇒ 还原

## Task 5：只读性 + 文档指向（AC7 / AC8 / AC11）

- [x] **Step 1（红）**：只读断言（跑前跑后两仓 `git status --porcelain --ignored` 一致 + `__pycache__` 不新增）实跑确认红
- [x] **Step 2（绿）**：python 侧 `-B` + `PYTHONDONTWRITEBYTECODE=1`；`docs/guard-authoring.md` 三处指向（§6 表 / §6.1 / §7）
- [x] **Step 3（验）**：只读断言转绿；`bash -n` 通过；`bun test tests/` 无回归

## Task 6：proposal 对齐（实施偏差回写）

- [x] **Step 1**：AC3「取数命令写死在脚本里」⇒ 改为「写在清单里（argv 数组）」并注明偏差原因（可测性，见 design D2）
- [x] **Step 2**：AC1 补 `canonical_path` 的 `"."` 例外（本仓自身，见 design D3）
- [x] **Step 3**：AC8 的 `--help` 范围表述改为与实现一致（`sed -n '2,Np'` 风格）
