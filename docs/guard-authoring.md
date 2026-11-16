# 判据与守卫的写法 —— 如何把「散文判据」升级为「结构判据」

> **状态**：2026-11-15 起（本仓 `v2.25` / `v2.26` 两批的实践沉淀）
> **面向**：给本仓加/改**守卫**（`tests/config-guards.test.ts`、`tests/delegate-core.test.ts`）的人
> **读者先看**：[`docs/MULTI-AGENT-DESIGN.md`](MULTI-AGENT-DESIGN.md) §4 权限模型（**契约真源**）——
> 本文只讲**怎么把契约钉住**，不复述契约内容。
>
> ⚠ **冲突裁决**：本文与 `prompts/build.md` / `lib/delegate-core.ts` / 守卫实现**冲突时，一律以后者为准**。
> 本文是**方法论参考**（非契约），其中带表格的段落是**某一时点的快照**（已逐处标出真源）。

---

## 1. 为什么要写这份

本仓的守卫有一大类是「**文档有没有说对**」。如果判据写成**散文措辞**（"verifier 仅能写 X"），
它就是**开集**的 —— 换一种说法就绕过。实测复发过两次：

| 复发 | 现象 | 谁抓到 |
|---|---|---|
| 2026-11-14 | delegate 工具 schema 的参数描述里**手抄**了旧的写集上限（front 派发时**实际读**那段文本）⇒ 可能据此把记账落点排除出 `scope` | oracle（人工读码） |
| 2026-11-15 | 守卫断言写成平凡式（`toContain("全部")` 之类）⇒ 任何行都能满足 | critic |

⇒ 结论：**判据要判「路径 / 逐字内容」，不要判「措辞」**。

---

## 2. 标准形态：真源 → 渲染器 → 投影 → 守卫

```
lib/delegate-core.ts                     ← 真源（常量，单点）
  export const VERIFIER_OWNS_PATHS = [...]
  export function verifierWriteSetBlock() ← 渲染器（内容完全由常量派生）
        ↓
prompts/build.md / plan.md / front.md   ← 投影（各嵌一块**逐字副本**）
  <!-- role-class-write-set:verifier
  allow: …
  owns: …
  -->
        ↓
tests/config-guards.test.ts             ← 守卫（**精确字符串比对**，不是散文解析）
  expect(text.includes(canonical)).toBe(true)          // 逐字
  expect(text.split(canonical).length - 1).toBe(1)      // 恰好一处（陈旧副本 ⇒ 红）
```

**为什么是「逐字块」而不是「解析散文」**：

| 方案 | 判据形态 | 绕过面 |
|---|---|---|
| 散文正则（**旧**） | 措辞 / 共现 | 换句式即失效；且**句子截断会藏住真实缺陷**（见 §4.2） |
| 逐字机读块（**当前**） | 精确字符串 | 多一个路径 / 少一个路径 / 改一个字符 ⇒ 必红 |

本仓已有两族按此落地（**截至 2026-11-15 快照**；真源 = `lib/delegate-core.ts` 的
`VERIFIER_ALLOW_ROOTS` / `VERIFIER_OWNS_PATHS` / `PLAN_REF_ROOTS` 与 `tests/config-guards.test.ts`
的 AC19 / accepted-roots 守卫）：

| 族 | 真源 | 渲染器 | 投影 |
|---|---|---|---|
| verifier 写集 | `VERIFIER_ALLOW_ROOTS` / `VERIFIER_OWNS_PATHS` | `verifierWriteSetBlock()` | `prompts/{build,plan,front}.md` |
| `plan_ref` accepted roots | `PLAN_REF_ROOTS` | `planRefRootsBlock()` | `prompts/plan.md` / `docs/MULTI-AGENT-DESIGN.md` / `docs/SUBAGENT-ORCHESTRATION.md` |

### 2.1 骨架（照抄即可）

```ts
// lib/delegate-core.ts —— 真源 + 渲染器
export const X_PATHS: readonly string[] = [/* … */]

export function xBlock(): string {
  return [
    "<!-- role-class-x",
    `allow: ${X_ALLOW_ROOTS.join(", ")}`,
    `owns: ${X_PATHS.join(", ")}`,
    "-->",
  ].join("\n")
}
```

```ts
// tests/config-guards.test.ts —— 守卫（逐字 + 唯一）
import { xBlock } from "../lib/delegate-core.ts"

test("AC?：X 的机读块 == lib 渲染的规范块（逐字 + 唯一）", () => {
  const canonical = xBlock()
  for (const rel of PROJECTIONS) {
    const text = readFileSync(path.join(import.meta.dir, "..", rel), "utf8")
    expect(text.includes(canonical), `${rel} 缺少或偏离规范机读块`).toBe(true)
    expect(text.split(canonical).length - 1, `${rel} 的规范块应恰好出现 1 次`).toBe(1)
  }
})
```

> ⚠ **注记区不受逐字约束** —— 块**上方**那段 `<!-- 机读投影：… -->` 说明可以自由写（它不参与比对）。
> 但它**会**被散文类守卫扫到 ⇒ 措辞仍要准确（见 §4.3）。

---

## 3. 三条配套纪律（比形态本身更值钱）

### 3.1 每个判据**分支**都要有对应的变红演练

**分支存在 ≠ 分支生效**。2026-11-15 实测：AC20 的「新形态闭集」分支因正则不产出对应 token
⇒ **不可达** ⇒ 声称的判据面**根本没生效**，而当时的变红演练只测了**另一支**（旧路径那支）⇒ 全绿。

⇒ **清单**：写下每条判据的分支清单 ⇒ 逐支做一次「注入 → 必须红 → 还原 → 必须绿」。

```bash
# 例：往活文档注入一条陈旧路径 ⇒ 该守卫必须红
python3 - <<'PY'
import pathlib
p = pathlib.Path("prompts/plan.md"); s = p.read_text()
m = "\n\n<!-- 机读投影：下面这块是"
p.write_text(s.replace(m, "\n\nverifier 的缓存落在 `.rddf/state/.ac-verdict-demo.json`。" + m, 1))  # 旧路径反例（行内标注 ⇒ 守卫的历史豁免认它，否则本文档被 AC20 判红）
PY
bun test tests/config-guards.test.ts   # 期望：红
```

### 3.2 **演练本身**也要验证有效

2026-11-15 三次演练**无效**（注入没被守卫看到，或注入后仍绿）：

| 演练 | 为什么无效 | 教训 |
|---|---|---|
| 注入「verifier 只能写 `.rddf/reviews`」这类**旧形态**反例到**注记区**附近 | 守卫锚的是**枚举形态**行（`accepted roots：` 带冒号），注记区不匹配 | 注入点要**对齐判据的锚** |
| 改状态行但仍留着「已归档」字样 | 走了**另一条**判定分支（语义式关闭）⇒ 注入无效 | 改一处不够，要确认**只**触发目标分支 |
| 替换后没产生预期 token | 分支不可达（§3.1） | 演练红**且**失败信息指向**预期的那条断言**才算有效 |

⇒ **判据红 = 有效演练**；红了但失败信息指向别的断言 ⇒ 演练无效。

### 3.3 不可机械核的部分要**如实登记**，不要假装闭合

判据无法机械化的面（枚举式词表、语义式声明、跨仓一致性）**必须**在守卫注释 + CHANGELOG 里
写成「已知残留」，并说明**为什么没闭合**。本仓当前登记在案的面：

| 面 | 位置 | 性质 |
|---|---|---|
| AC20 的历史豁免闸门（行级白名单） | `tests/config-guards.test.ts` AC20 注释 | 枚举式词表；同行洗白面 |
| AC14 的写集动词词表 | 同上 AC14 注释 | 枚举式词表；否定语境可洗白 |
| 「需要用户裁决」族的**硬禁止措辞**（「自行假设 / 最合理的假设」等） | 同上「独立会话机制」describe 的 ⑨-c 判据 | 枚举式词表；**换词即绕过**（措辞族判定的固有边界） |
| **`shell` 写盘**（`sed -i` / `tee` / `> file`） | 同上「未覆盖清单」注释（AC14） | 权限层**不按角色约束 `shell`** ⇒ 层 1 钉不住、层 2 的「按写目标」判据也抓不到 |
| 「语义式关闭」（improvement 只写「已完成」而无归档指针） | 同上 `isClosedImprovement` 注释 | 故意行为，超出漂移威胁模型 |
| 跨仓那半（另一仓的清单） | `.rddf/reviews/session-handoff-20261114.md` §7 | CI 不能依赖仓外路径 ⇒ 人工 `diff` |

⇒ **不要**写「本仓只剩一处枚举式词表」这类**会少记一面**的台账 —— 三处词表要**并列登记**
（AC20 白名单 / AC14 写集动词 / 「自行假设」族）。

> **快照声明**：下表是**截至 2026-11-16** 的快照；真源 = `tests/config-guards.test.ts` 里
> AC14 / AC20 的头部注释、「独立会话机制」describe 的 ⑨-c 判据与 `isClosedImprovement`
> 实现（守卫改了 ⇒ 以守卫为准）。

---

## 4. 五个实测陷阱（都踩过）

### 4.1 判据分支是死代码

见 §3.1。**症状**：守卫绿，但那个面**从没生效过**。
**自查**：守卫里每条 `if` 分支，都要能指出**哪个演练**覆盖它。

### 4.2 句子解析会**藏住**真实缺陷

旧守卫的反向校验是「取 `accepted roots：` 后**第一句**」（`.split(/[。\n]/)[0]`）——
它把「缺闭合反引号」的真缺陷**截掉**了（`prompts/plan.md:90` 的最后一个 root 少了闭合反引号，
句子一截就看不见）。改成**行级锚定**（锚枚举形态行）后当场抓到。

⇒ **教训**：句子截断 = 盲区。**宁可多扫一行，不要提前截断**。

### 4.3 治理文档**引用判据** ⇒ 命中判据自己

写 CHANGELOG 时逐字引用了守卫的正则 ⇒ 守卫把 CHANGELOG 判红。
**结构性修法**：`docs/CHANGELOG.md` **从扫描集排除**（它开头自述「**本文档不描述现状**」⇒ 是历史记录）。
⇒ 引用判据形态的文档，要么排除，要么改写成不触发判据的形态。

**同一坑的第二种形态**：文档里**把错误陈述当反例引用**（"注入『verifier 只能写 .rddf/reviews』这类旧形态反例"）⇒ **同样命中判据** ⇒ 反例行必须**在行内标注**（本仓的历史豁免词表认这些标注），
否则**文档自己**被守卫判红。⇒ 2026-11-15 写本文档时即被 AC14 + AC20 各判红一次。

### 4.4 管道会**掩盖退出码** ⇒ 带着失败提交

```bash
bun test tests/ | tail -4 && git commit -q -m "…"   # ← && 看的是 tail 的退出码！
```

2026-11-15 实测：带着 2 个失败提交了。
⇒ **提交前单独校验退出码**，别把「测试」和「提交」串在一条管道里。

⚠ **同一坑的第二个形态（2026-11-15 变红演练时踩到）**：`bun test` 的输出**被捕获**时
（非 TTY），失败明细写到 **stderr**，**stdout 里一行 `(fail)` 都没有** ⇒
「数 stdout 里的 `(fail)` 行」判红 ⇒ **永远得到 0（假绿）** ⇒ 演练会「通过」而其实没红。
⇒ **判红只认退出码**（`bun test` 非 0 = 有失败）；要读明细就读 stderr。

⚠ **演练脚本不得用 JSON 往返改配置**：`json.loads` + `json.dumps(indent=2)` 会把整个
`opencode.jsonc` **重排**（实测 305+/159- 的格式漂移）⇒ 演练把工作树污染了。
⇒ 改配置用**外科式文本编辑**（找锚点行 → 插入/删除那一行）。

### 4.5 扫描集的 `excluded` 原来**只判目录**

（**截至 2026-11-15 的现状**：目录与单文件都判；真源 = `tests/config-guards.test.ts` 的
`excluded` 判定分支）

⇒ 单文件排除（`docs/CHANGELOG.md`）**静默失效**。现在目录与单文件都判。

---

## 5. 扫描集口径（「活文档」是什么）

散文类守卫（本仓 AC14 / AC20）扫的是**现行指引**，不是历史记录。

> **快照声明**：下表是**截至 2026-11-15** 的快照；真源 = `tests/config-guards.test.ts` 里
> AC14 / AC20 的 `scanRoots` / `excluded` 定义（守卫改了 ⇒ 以守卫为准）。

| 扫 | 不扫（为什么） |
|---|---|
| `prompts/**` | `docs/adr/**`（历史 ADR 描述写作时点状态） |
| `docs/**`（除上） | `docs/CHANGELOG.md`（自述「不描述现状」+ 天然引用判据形态 ⇒ §4.3） |
| `commands/**` | `.rddf/state/**`（运行时） |
| `.rddf/improvements/**`、`.rddf/roadmap/**` | `.rddf/reviews/**` 的历史记录（`*-verify.md` / `*-review.md` 等）—— 但**规格件** `backend-handoff-protocol-spec.md` 是白名单（被 ADR 元数据当权威引用） |
| 规格件 `.rddf/reviews/backend-handoff-protocol-spec.md` | `.rddf/plans/**`（rdd-builder P1 产物，当前不存在，出现时按注释扩） |

⚠ **两份守卫的扫描集必须同口径**（否则一处放宽、另一处仍严 ⇒ 维护者会误判覆盖面）。
⚠ **已关闭的 improvement** 是历史记录（记的是当时的路径）⇒ 排除；但排除条件要**机械可核**：
带归档指针的 ⇒ **核目录真存在**；跨仓的 ⇒ **状态行本身**须声明外仓。

---

## 6. 跨仓的那一半怎么办

本仓有一族事实**横跨两个仓**（例：verifier 的 owns 清单，本仓常量 ↔ 产品仓 `SKILL.md`）。

| 做法 | 结论 |
|---|---|
| 在本仓守卫里直接读另一仓的文件 | ❌ 另一仓在**用户 home** ⇒ CI 上必然 SKIP ⇒ **等于没有守卫** |
| 只在本仓钉 | ✅ 覆盖「本仓常量 ↔ 投影」 |
| 只在另一仓钉 | ✅ 覆盖「另一仓实现 ↔ 另一仓清单」 |
| **两仓清单逐字一致 + `scripts/cross-repo-check.sh`** | ✅ 覆盖「两仓之间」—— 脚本为准（清单：`.rddf/config/workspace.json`）；手工等价式见 §6.1 |

⇒ **各自钉自己那半，跨仓靠逐字一致 + 核对脚本**。改动任一侧清单时**必须**跑 `scripts/cross-repo-check.sh`（退出码：`0` 一致 / `1` 清单坏 / `2` 漂移 / `3` 环境不满足 —— 与 `scripts/check-upstream-anchors.sh` 的 `2` 同义）。

### 6.1 跨仓核对命令（verifier owns 清单 —— 消费侧 ↔ 生产侧）

**脚本为准**：`scripts/cross-repo-check.sh`（清单 `.rddf/config/workspace.json`）。它把「清单坏 / 仓缺 / 身份不符 / 命令失败 / 两侧不一致」拆成**互不混淆**的出口码 —— 手工 `diff` 做不到这点（缺仓时 `diff` 必然报差异 ⇒ 环境故障被读成业务结论）。

```bash
scripts/cross-repo-check.sh          # 用默认清单
scripts/cross-repo-check.sh --workspace /path/to/other-workspace.json   # 换清单（多 checkout / 测试）
```

> 下面是**脚本不可用时**的等价手工式（脚本不可用 ⇒ 一律**不算通过**，按「取证不可用」处理）：

```bash
# 消费侧（本仓）：真源 → 机读块渲染，取 owns 行
cd ~/.config/opencode && \
  bun -e 'import {verifierWriteSetBlock} from "./lib/delegate-core.ts"; console.log(verifierWriteSetBlock())' \
  | grep '^owns:' > /tmp/opencode/owns-opencode.txt

# 生产侧（rdd-workflow 仓）：skill 的 owns 清单，经其 state_paths.py 渲染
cd <rdd-workflow 仓> && \
  python3 -B -c "from _lib.verifier.state_paths import SKILL_OWNS_PATHS; print('owns: ' + ', '.join(SKILL_OWNS_PATHS))" \
  > /tmp/opencode/owns-product.txt

# 比对
diff /tmp/opencode/owns-opencode.txt /tmp/opencode/owns-product.txt && echo "✔ 两仓清单逐字一致"
```

> 生产侧的对应手册：`docs/operations/verifier-state-namespace.md`（**在 `rdd-workflow` 仓**，§3「怎么加一条状态路径」）。

---

## 7. 守卫作者核对单（加/改守卫时逐条过；与 `prompts/build.md` 的「§自查清单」不是同一份 —— 后者是角色流程的逐回合清单）

- [ ] 判据判的是**路径 / 逐字内容**，不是措辞？（措辞 ⇒ 开集）
- [ ] 真源是**单点常量**？投影是**逐字副本**？守卫是**精确比对**？
- [ ] 每条判据的**每个分支**都有对应的变红演练（演练红 + 失败信息指向预期断言）？
- [ ] 守卫注释登记了**不可机械核**的面（并列登记，不宣称「唯一」）？
- [ ] 扫描集口径与**其它守卫一致**？`excluded` 同时判**目录与单文件**？
- [ ] 新文档/注释里**引用判据形态** ⇒ 会被自己扫到 ⇒ 措辞是否触发？
- [ ] 提交前**单独**校验测试退出码（不用管道串 `&& git commit`）？
- [ ] 跨仓的那一半 ⇒ 跑过 `scripts/cross-repo-check.sh` 吗？（退出码 `0` 才算一致；`2` = 漂移 / `3` = 环境不满足 ⇒ **都不算通过**）
