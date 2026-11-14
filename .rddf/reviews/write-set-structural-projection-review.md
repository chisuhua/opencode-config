# 审稿记录 — 写集「结构比对」批次（v2.25）

> 批次：`v2.25`（`docs/CHANGELOG.md` v2.25 条目）
> 范围：`lib/delegate-core.ts`（新增渲染器）、`prompts/{build,plan,front}.md`（各 + 机读块与注记）、
> `tests/config-guards.test.ts`（AC19 / AC20 新增、AC11 转换、AC14 注释）、`.rddf/improvements/rdd-verifier-state-consolidation.md`（P3 关闭 + 演进项收口）
> 治理面判定：`prompts/**` + 守卫断言增删 + `lib/**` ⇒ 属治理面 ⇒ **oracle → critic 各 1 轮**（顺序不可颠倒）

## 1. oracle（咨询模式）— `PASS-WITH-NOTES`

3 条 finding **全部闭合**；其中 1 条是**高影响**（判据声称的面根本没生效）。

| # | finding | 落点 | 闭合方式 |
|---|---|---|---|
| 1 | **AC20 的「新形态闭集」分支是死代码** —— TOKEN 正则只抽 `.ac-*` / `rdd-verify-context*` ⇒ 产出永不以 `.rddf/state/verifier` 开头 ⇒ 该分支不可达 ⇒ **声称的判据面未覆盖**（活文档新增任意 `.rddf/state/verifier/<名>` 不会被拦）。附带：`covered()` 不展开 `*` glob | `tests/config-guards.test.ts` | TOKEN 改三向 + 覆盖判定支持 glob（`*` → `[^/]*` 整串锚定）⇒ 变红演练 ④ 由**不红**变**红**（死代码的实证） |
| 2 | 历史标记词表含**裸「旧」**（单字太宽：「仍旧」「照旧」都命中 ⇒ 豁免变后门） | 同上 | 删裸「旧」，改 `旧路径\|旧形态\|旧版\|收拢前\|已收拢`（保留 历史/退役/作废/legacy/pre-consolidation） |
| 3 | `CLOSED_IMPROVEMENT` 把**「已立项」当已关闭**且**无位置锚**（正文中部引用一句他人状态行也能翻转整文件豁免） | 同上 | 关闭判定改为「**状态行**说了算 + 头部块前 15 行内给出归档指针」；`已立项` 需头部块含 `openspec/changes/archive/` |

### oracle 建议中**我否决**的一条（记入以免复发）

oracle 建议用 **allow 根的前缀覆盖**来判「新形态路径」（`token.startsWith(root + "/")`）。
**否决**：allow 根是**目录根** ⇒ 其下任意路径都被它覆盖 ⇒ 该判定**恒真、没有判别力**（只是把死分支变成「活但恒真」的假信心）。
⇒ 最终判据改为：**块内具体文件必须落在 `owns` 模式内**（allow 根只认「目录引用」形态：`.rddf/state/verifier` / `/**` / `/*`）。

## 2. critic（4 段式）— `APPROVE_WITH_CONDITIONS`

`mergeable: yes`，`scope_exceeded: false`，**无 BLOCKER**。1 条 SHOULD_FIX + 8 条 NIT，**全部处置**。

| # | finding | 处置 |
|---|---|---|
| SHOULD_FIX | 同一文件内**两处互相矛盾**的「最后一处词表」登记（AC20 的 HIST 词表 vs AC14 的 stale 正则）⇒ 台账少记一面 | 两处口径**并列登记**（「本仓还剩**两处**枚举式词表」），并注明各自的角色：HIST = AC20 内部行级豁免闸门；AC14 = 「写集被描述得更窄」的判据 |
| NIT 1 | TOKEN 闭集漏 `.verifier-*` 族（`.rddf/state/.verifier-report.json`） | **补族**（该族是本次收拢的清理对象之一）⇒ 变红演练 ⑤ 实测变红 |
| NIT 2 | 「已关闭 improvement 整体排除」是**改状态行即可翻转**的开关 | 登记为**故意不闭合**的残留：伪造关闭属**故意**行为，超出守卫的漂移威胁模型 ⇒ 真伪由 `rdd-doctor` / 流程评审承担 |
| NIT 3 | HIST 是**逐行**豁免 ⇒ 「活错误陈述 + 同行塞一个历史词」可同框洗白 | 同上，登记为已知面（收紧到「引用/标注语境」会误伤真实退役注记） |
| NIT 4 | `owned()` 非 glob 分支带目录前缀语义，与 glob 分支不对称 | 注明该分支**为「owns 未来出现目录项」预留**（当前 3 个字面 owns 项走不到） |
| NIT 5 | TOKEN 排除字符集不含 ASCII `.` / `]` ⇒ 英文句点收尾路径会带尾缀 ⇒ 误红 | 登记为**已知边界**（fail-safe 方向：误红而非绕行） |
| NIT 6 | AC20 注释称「与 AC14 同一口径」，但 AC14 额外白名单扫描**规格件** `.rddf/reviews/backend-handoff-protocol-spec.md` | **AC20 补扫该规格件**（口径对齐，且覆盖更全） |
| NIT 7 | improvement 状态行形态与本仓惯例（`已立项 → openspec/changes/archive/…`）不一致；「未过 metis」与「已完成」并存 | 状态行改为惯例形态；「未过 metis」行补「**关闭时未补**，留存当时状态」消歧 |
| NIT 8 | 注记里的机械对齐命令未经实测 | **实测通过**（`bun -e 'import {verifierWriteSetBlock} …'` 输出与块逐字一致） |

## 3. 验证

| 项 | 结果 |
|---|---|
| `bun test tests/` | **535 pass / 0 fail**（8 files） |
| `bash scripts/check-upstream-anchors.sh` | **23/23** |
| 变红演练 5 例（逐条实跑） | ① 改常量 ⇒ AC19 红｜② 塞根下旧路径 ⇒ AC20 红｜③ 改投影块 ⇒ AC19 红｜④ 塞**块外新形态**文件 ⇒ AC20 红（**修死分支前不红**）｜⑤ 塞 `.verifier-*` 族 ⇒ AC20 红（补族后） |
| 注记里的对齐命令 | 实测输出与规范块逐字一致 |

## 4. 遗留（如实登记）

1. **两处枚举式词表**（AC20 的 HIST 豁免闸门 + AC14 的窄化描述判据）—— 前者是**行级**豁免（可同框洗白），后者原型证明无可替代的结构化写法（共现式判定 7/7 误报）。
2. 「已关闭 improvement 整体排除」是**改状态行即可翻转**的开关 —— 靠流程与 `rdd-doctor` 兜。
3. `PLAN_REF_ROOTS` 那族「accepted roots」守卫**仍是句子解析 + glob 形态过滤** —— 本批只升级了 verifier 写集这一族。
4. 「写集被描述得更窄」的判据**没有可靠的结构化替代** —— 共现式判定原型 7/7 误报 ⇒ 保留 AC14 窄词表。
