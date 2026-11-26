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
| 「必须问用户」的**覆盖面机读清单**（`<!-- req-question-census`） | 同上 ⑩-b 判据 + `prompts/build.md` 的块 | **半枚举**（人维护的节标题清单）；**漏登记不可机械核** ⇒ 靠 §自查清单的登记义务 + 评审 |
| ⑩-a **点名条款**的措辞（「**点名的两个节**」+ 两个节名） | 同上 ⑩-a 判据 | 措辞族；换说法即绕过（但锚到条款本身 ⇒ 不会被机读块恒真满足） |
| ⑩-c **兜底句**（「停机并交付裁决请求」） | 同上 ⑩-c / ⑩-b 判据 | 措辞族；它是 v2.41 的既有形态名 ⇒ 复用而非新增 |
| ⑩-c **禁止放宽句**（不得以可恢复 / 可回滚 / 有 git 历史 / 可重新生成 作为不必问的理由） | 同上 ⑩-c 判据 | 措辞族；覆盖「可恢复性」这一类推理，**不闭集化「不可逆」的类别** |
| ⑩-c **「已授权」豁免禁句**（不得以「用户已明确要求该动作」作为免除问一次的理由） | 同上 ⑩-c 判据 | 措辞族；`E-6` 的 prompt **就是**用户下令删除 ⇒ 没有这句，模型下一步会推理「已授权 ⇒ 不必问」 |
| ⑩-c **「用户工件」操作化定义**（本回合之前已存在的任何文件） | 同上 ⑩-c 判据 | 名词定义式判据；零定义则不可判 |
| **`shell` 写盘**（`sed -i` / `tee` / `> file`） | 同上「未覆盖清单」注释（AC14） | 权限层**不按角色约束 `shell`** ⇒ 层 1 钉不住、层 2 的「按写目标」判据也抓不到 |
| 「语义式关闭」（improvement 只写「已完成」而无归档指针） | 同上 `isClosedImprovement` 注释 | 故意行为，超出漂移威胁模型 |
| 跨仓那半（另一仓的清单） | `.rddf/reviews/session-handoff-20261114.md` §7 | CI 不能依赖仓外路径 ⇒ 人工 `diff` |

⇒ **不要**写「本仓只剩一处枚举式词表」这类**会少记一面**的台账 —— 上述各面要**逐条并列登记**
（AC20 白名单 / AC14 写集动词 / 「自行假设」族 / v2.42 的**覆盖面机读清单**（半枚举）/
点名条款措辞 / 兜底句 / 禁止放宽句 / 「已授权」豁免禁句 / 「用户工件」定义 / `shell` 写盘盲区）。

> **快照声明**：下表是**截至 2026-11-17** 的快照；真源 = `tests/config-guards.test.ts` 里
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

---

## 8. 兜底类守卫的接线前提：宿主钩子与 permission 的先后

> 适用对象：`push-gate`（force push 兜底）、`model-fallback`（模型降级）这类**「静默兜底」**—— 它们的存在理由就是「在 config 的 `deny` 或用户的 `Allow always` 之间仍然生效」。**这个前提必须被验证，不能假定。**

### 8.1 结论

`tool.execute.before` 插件钩子**先于**工具内部的 `permission.assert`；钩子抛错会让调用**在命令运行前**被拒。⇒ 插件在上游，config `deny` 与 `Allow always` 都在下游 ⇒ **都绕不过插件**。

### 8.2 调用链（语义锚点，不钉行号）

| # | 位置 | 事实 |
|---|---|---|
| 1 | `packages/core/src/tool.ts`（工具调用入口） | 先 `beforeExecute(...)` ⇒ `hooks.trigger("tool", "execute.before", …)` |
| 2 | 同上，其后 | 再 `executeTool(...)` |
| 3 | `packages/core/src/tool/runtime.ts` 的 `execute` | 解码后 `tool.execute(...)` —— **此处无 permission** |
| 4 | `packages/core/src/tool/plugin/shell.ts` 的 `execute` → `prepare` | 命令级 `permission.assert(...)` 在这里 |
| 5 | `packages/core/src/plugin/hooks.ts` 头注 | 「Only **tool execute.before** may fail: a `Tool.Error` rejects the call **before it runs**」 |

### 8.3 怎么验证（顺序固定，两层）

1. **源码先行（0 额度）**：读上表，钉版本锚（`opencode --version` ↔ 源码树 commit）；结论落 `.rddf/reviews/`。
2. **运行时确认（吃额度）**：e2e 仓的 `test_push_gate_runtime.bats`。**判据设计的关键是「两种情形的错误来源要把顺序钉死」**：
   - force push（用 config 的 deny glob **匹配不到**的短簇 `-uf`）⇒ 得到 **`push-gate:` 的拒绝** ⇒ 钩子先拒绝，没走到 permission；
   - 非 force push ⇒ 得到 **permission 的「cannot ask」** ⇒ 钩子放行后才到 permission。
   - ⚠ **不要只断「有错误」**：permission 的拒绝会冒充插件（这是 CG-1 踩过的「只匹配模糊文案」的同类坑）。

### 8.4 已知边界（诚实登记）

| 面 | 状态 |
|---|---|
| 钩子能拦且能阻止执行 | ✅ 源码 + 运行时双确认 |
| `Allow-always` 不能绕过插件 | ✅ **源码层**成立；运行时世界**无法复现**（非交互会话不能授予并持久化）⇒ 登记 token，不再花额度追 |
| `retry` 钩子（model-fallback）真失败时推进链 | ⏳ 未验证（探针门见 `.rddf/improvements/model-fallback-runtime-e2e.md`） |
| 负向面：**不该切时会不会乱切** | ⏳ 未验证（误切比不切更伤用户） |

---

## 9. 改进池 front-matter 守卫（A6）：让「已完成」可判

> 问题：`rddf status` 的待办池混着已完成的事，STATUS 列全是兜底「待讨论」、PRI 列全是 `-`。根因是**状态没有机读入口**（产品侧只认「同名归档目录」与「front-matter `状态`」两条通路）。

### 9.1 字段形态（**4 行块**，不是 3 行）

```
---
状态: 已实施（2026-11-26）
优先级: P2
---
```

- **已有 frontmatter 块时必须合并键**，禁止新建第二块（产品侧只读**第一个** `---` 块）。
- **禁半角冒号 + 空格**（`已实施: 2026-11-26` 会炸 YAML）；日期用**全角括号**。
- **散文状态行（`> **实施状态**…`）必须留在文件前 15 行内** —— AC20 的关闭判定只读前 15 行的第一处匹配；front-matter 行数会把它下移。

### 9.2 词表（**前导匹配 `startswith`**，不是精确匹配）

| 类 | 命中串（选一） | label |
|---|---|---|
| terminal（离开 pending） | `已完成并归档` / `已实施并验收` / `已归档` / `已完成` / `已实施` / `implemented` / `completed` / `已作废` / `superseded` | 已归档 / 已完成 / 已实施 / 已作废 |
| open（留在 pending） | `未立项` / `待立项` / `已立项` / `draft` / `规划输入` / `backlog` / `待审查` / `待回填` / `已推迟` | 同名 |
| partial（留在 pending） | 含子串 **`已闭合`** | 部分闭合 |
| 都不命中 | —— | `marker[:16]` 兜底；**空 ⇒ 「待讨论」** |

⇒ 写「归档于 2026-11-23」**不会**命中 `已归档`（前导不是它）⇒ 会退化成兜底。**逐字照上面的表写。**

### 9.3 守卫（`tests/config-guards.test.ts` 的 A6）

- **祖父名单冻结**：A6 落地时仍无 `状态` 的存量文件逐条列名；**名单外的 `.md` 缺 `状态:` 或 `优先级:` ⇒ 红**；名单内文件补了字段却没从名单移除 ⇒ 红（名单只减不增）。
- **联合断言**：新增文件的散文状态行必须在**前 15 行**内（否则 A6 绿、AC20 红 —— 两条判据无边界）。

### 9.4 三条反例（**不要按 change 指针推断「已完成」**）

审计逐条核 Acceptance 时抓到过 3 个「表面已完成、实际未完成」的条目（关联 change 已归档，但 ADR 增补记录没写 / checklist 那行没落地 / 还写着「待审查」）⇒ **任何「按指针批量标完成」的清账做法都会把真待办误标成已完成，债从视野里消失**。核法只有两种：**核 Acceptance 的每一条**，或**核产物是否在盘上**。

### 9.5 与产品侧的关系（已决）

「让 `collect_pending` 从正文 change 指针推断 terminal」这条**不立项**（会把上面 3 个反例自动化）。替代 = 产品侧模板默认带字段；本仓侧由 A2（存量）+ 本守卫（增量）自闭环。详见 `.rddf/improvements/rddf-status-improvement-status-mismatch.md` §9。

---

## 10. 指针型判据必漂移：锚点钉前提面，不钉偶然词汇

> **事故（2026-11-25，P5 假红）**：`scripts/check-upstream-anchors.sh` 的 P5 锚点模式是 `merge\(agent\?\.permissions` —— 钉的是上游内部**组合子的函数名**。上游把 `merge(...)` 重构为 `PermissionPolicy.fromRules(agent?.permissions ?? …, session.permissions ?? [])`，**语义零变化**，锚点却失效 ⇒ `RESULT: DRIFT` ⇒ 该脚本在 `.rddf/commit-gate.json` 的 `verify_commands` 里 ⇒ **提交门 fail-closed ⇒ 全仓不可提交**。处置：改钉语义 token（`agent?.permissions`）+ 新增 P5b（`agent: agent\.id,` —— 建会话绑定 agent id）；完整记录见 ADR 的「实施记录 · 上游语义漂移事故」与 V15。

### 10.1 判据（一句话）

**锚点只钉「语义 token / 行为标记」，不钉「偶然词汇」** —— 函数名、行号、以及**被用来消歧的标点**（例如靠尾逗号把「create」与「switchAgent」两处调用区分开：判别力全押在那个逗号上）。

### 10.2 为什么（两侧代价**不对称**）

| | 假红（钉了偶然词汇 + 上游改名） | 漏检（模式太宽 + 上游语义真变） |
|---|---|---|
| 代价 | **全局**：提交门 `verify_commands` 含该脚本 ⇒ 全仓不可提交（本仓已实测两次：2026-11-23 的 AC10④、2026-11-25 的 P5） | **局部**：靠人工复核 + ADR V15 的语义复核兜住 |
| 附带激励 | 诱发「改判据」而不是「改前提」的逆向操作（v2.70 同型：`find` 钉住整段散文 ⇒ 正常编辑被挡） | — |

⇒ 不对称 ⇒ **宁可让模式宽一点、把不能锚的部分如实登记**，也不要把模式收窄去「看起来更精确」。

### 10.3 硬要求

1. **钉语义 token / 行为标记**：组合子改名、参数重排、类型别名不应影响命中。
2. **如实登记两类「不可锚」**（不假装覆盖）：
   - **缺席性** —— 正向 grep 断言不了「某个键不存在」（例：「建会话不传 permissions」）⇒ 只能钉**正面标记**（`agent: agent.id`），并写明「上游若新增该入参，本锚点**不报警**」；
   - **单点出现性** —— token 只在某处出现一次时才等价于语义（例：`agent?.permissions` 在 `permission.ts` 仅单点）⇒ 写明「上游引入第二处即**无声失效**」。
3. **判别力依赖脆弱点时，注释必须写三样**：依赖什么 / 失效形态 / 届时怎么人工复核（范例见脚本 P5 与 P5b 的注释块）。
4. **文档里的引用写「文件 + 语义形状」，不写 upstream 行号** —— 行号写进文档就是下一个漂移源（ADR 前置事实已按此清理）。

### 10.4 适用面（不只锚点脚本）

任何**以文本匹配为判据**的守卫共用同一纪律：回滚清单的 `find` / `replace`（见 v2.70 的形态守卫）、prompt 里的能力面 / 写集**逐字投影块**、`config-guards` 的期望清单。它们的共同点是判据绑在**原文**上 ⇒ 原文一改就红；区别只在红了之后是「该改清单」还是「该改判据」。
