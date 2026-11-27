# design: commit-gate-baseline-known-failures

> **判据真源**：`docs/adr/ADR-commit-verification-gate.md` 的 **D10**（Status **Accepted** 2026-11-27）
> + **Verification V20–V25**。本文件只写**实现形状**（不改判据语义）。
> **归属拆分**：机制面（`lib/**` / `plugins/**` / `scripts/**` / `tests/**`）⇒ **builder**；
> 治理面（ADR D9 表 / 主题文档 §2.8.8）⇒ **architect**（D9⑰ 登记 + 措辞）⇒ 两段顺序见 D-7。

## D-1 声明形状（`inspection` = 识别机制）

```jsonc
{
  "verify_commands": [["bun", "test", "tests/"], ["bun", "scripts/commit-gate-baseline-doctor.ts"]],
  "known_failures": [
    { "command": ["bun", "test", "tests/"], "match": "pre-existing failures in test_llm_cache" }
  ],
  "inspection": {
    "command": ["bun", "scripts/commit-gate-baseline-doctor.ts"],
    "carrier": "scripts/commit-gate-baseline-doctor.ts"
  },
  "timeout_ms": 600000
}
```

| 约束 | 判定 | 违例后果 |
|---|---|---|
| `inspection.command` 必须是 `verify_commands` 的**独立条目**（逐字相等，不得与别的条目共享输出） | commit 时静态判定 | **字段整体无效** ⇒ 退回 D2① 硬门 |
| `known_failures[*].command` **不得**绑定 `inspection.command` | 静态判定 | 该条目**无效**（不放行），其余条目照常 |
| `inspection.carrier` 必须 **git-tracked**（`git ls-files` 命中 + **非 symlink**） | commit 时静态判定 | **字段整体无效** ⇒ 退回硬门 |
| 声明含 `known_failures` ⇒ `inspection` **必须存在**且满足上面三条 | 静态判定 | **字段整体无效** ⇒ 退回硬门 |

⚠ **总兜底**：声明的**任何**解析 / 校验异常（`known_failures` 非数组 / `match` 非字符串 / `command` 非数组 /
`inspection` 形状非法 / JSON 损坏）⇒ **视作未声明 ⇒ 退回 D2① 硬门**（绝不默认放行）。

## D-2 命中判定放 `lib/commit-gate.ts`（纯逻辑、可注入）

现有结构（`GateInput` 注入 ⇒ 单测不碰进程）⇒ 新增：

```ts
export interface KnownFailure { command: string[]; match: string }
export interface CommitGateDeclaration {
  verify_commands: string[][]
  timeout_ms?: number
  known_failures?: KnownFailure[]
  inspection?: { command: string[]; carrier: string }
}

export function matchKnownFailure(
  decl: CommitGateDeclaration, argv: string[], output: string
): { matched: boolean; pattern?: string; reason?: string }
```

- **匹配粒度 = 命令 + 合并输出**（stdout+stderr，**换行归一 `\r\n` → `\n`**）；
- 命中 ⇒ `matched: true` + `pattern`（供留痕）；
- **超时** ⇒ 调用方**不进入**匹配（按未命中 ⇒ 照旧拒）。

## D-3 特异性规则（A3）

1. `match` **去空白后**长度 ≥ 8（纯空白 / 过短 ⇒ 声明**不合法** ⇒ 视作未声明）；
2. **通用词表**（`fail` / `failed` / `failing` / `failure` / `failures` / `error` / `errors` / `timeout`）——
   实现细则（**实测校准**）：**末尾 token 不得是通用词**（大小写不敏感），而非「含通用词即拒」。
   ⇒ `"pre-existing failures in test_llm_cache"` **合法**（末尾 token = `test_llm_cache`）；
   `"xx 3 fail"` **不合法**（末尾 token = `fail`）。
   ⚠ 选这条细则的原因：metis 的两个反例分别指向「子串规则会误杀合法模式」与「纯整词规则会放过 `xx 3 fail`」，
   **末尾 token 规则同时满足两者**（且方向安全）。

## D-4 输出捕获：匹配用**全量**，报告用**尾部**

现有插件只留 `outputTail`（2000 字）⇒ **不够匹配**（`match` 可能在前段）⇒
`run()` 同时返回 `merged`（全量，上限沿用 `maxBuffer: 16MB`）与 `tail`（末 2000 字）：
匹配用 `merged`，错误消息用 `tail`（现状不变）。

## D-5 巡检层（新增独立脚本，不动 `commit-gate-doctor.ts`）

`scripts/commit-gate-baseline-doctor.ts`：

| 项 | 口径 |
|---|---|
| 输入 | 声明（`verify_commands` + `known_failures`） |
| 标识提取器 | `bun test` ⇒ 失败用例名（`(fail)` 行）；`format.sh --check` ⇒ 待格式化文件路径；**无提取器** ⇒ 该命令**不参与**集合比对（报「无法提取标识」，不静默当通过） |
| 比对 | 条目 → 标识映射 = 「`match` 是标识的子串 **且** `match` 里的每个数字段都以**相同数值**出现在标识里（`(?<!\d)N(?!\d)`）」⇒ 每条**必须**映射到 ≥1 个当前实际标识 ⇒ 否则**不再命中** |
| 数字边界（**膨胀必被发现的机制**） | `match: "3 fail"` 对标识 `"13 fail"` **不**匹配（`3` 是 `13` 的一部分）⇒ 失败数 3 → 13 时该条**不再命中** ⇒ 巡检红 |
| 输出 | 不再命中的条目 ⇒ 「可清理」提示；`3 fail` → `13 fail` ⇒ 标识集合变大 ⇒ 该条不再命中 ⇒ **红** |
| 退出码 | `0` 通过 / `1` 红（⊄ 实际失败 或 存在不再命中的条目）/ `2` skip（判定不可得） |

⚠ **不复用子串语义**（这是巡检层存在的唯一理由）：若复用 `match` 子串，`3 fail ⊆ 13 fail` 会被永远命中。

## D-6 防增守卫（C1/C2）

- 期望集载体 = **独立文件** `tests/fixtures/commit-gate-known-failures.expected.json`（真仓当前为空集）；
- `tests/config-guards.test.ts` 扩展：**逐项相等**断言声明的 `known_failures` 与期望集 ⇒ 改声明 ⇒ 红；
- 真仓守卫**确实被接线**的判别力：用例断言「真仓声明的 `known_failures` 被守卫实际读取」（空集也走一遍比较）。
- ⚠ 本仓声明当前**无** `known_failures`（期望集 = 空集）⇒ 防增守卫恒绿但**被实际读取**；巡检脚本在本仓**不被触发**（它是给「有存量红的仓」用的能力，见 CppTLM 场景）。

## D-7 D9 计数 16 → 17 的迁移（**陷阱**：归档并集塌陷）

现状：守卫**硬编码** `AC_HEADING = "## D9 十六项登记（AC 面）"`（`:38`）与计数 `16`（`:174` / `:269`），
且 `collectAcFaceFiles` 按**单一标题**收集 ⇒ 若只把常量 bump 成「十七项」，
**已归档 proposal 的「十六项」小节会全部掉出 AC 面并集** ⇒ D9①–⑯ 的 AC 面登记**静默消失** ⇒ 守卫红，
且**归档 proposal 不可回改**。

⇒ 修法（两处同批）：
1. 守卫接受**多标题**：`AC_HEADINGS = ["## D9 免宣称项登记（AC 面）", "## D9 十六项登记（AC 面）"]`
   （新标题 + **旧标题保留** ⇒ 归档载体继续有效）；
2. 计数断言从 **16** 改为 **17**（期望集从 ADR 表派生 ⇒ 加第 ⑰ 行 ⇒ 必红，这条判别力不变）。

**两段顺序**（治理面 vs 机制面）：治理面加 ⑰ 行 ⇒ 守卫（按 16 项）立即红 ⇒ 中间态红**不接受**
⇒ 本 change 的治理面 + 机制面 + AC 面 ⇒ **一个 commit** 落地。

## D-8 留痕通道（A4）

插件 `console.log` 会被宿主吞掉 ⇒ **notice 不走 stdout** ⇒ 走**账本**：
命中放行时把 `baseline 命中: <command> / match=<…>` 追加到 `.rddf/state/commit-gate-notices.jsonl`
（一行一事件）⇒ 运行时可区分「真绿」与「baseline 命中」，且可审计。
纯逻辑层返回 `notices: string[]`，插件负责落盘 ⇒ 单测断言「notice 文本 + 落盘函数被调用」。

## D-9 不做什么

- 不改 D2② / D2③ / D5（baseline 只作用于 D2① 的退出码）；
- 不改 D3（未声明 ⇒ 不设门禁）；不引入「时间窗口内忽略失败」；
- 不自动生成 baseline（由作者登记）；不改 `commit-gate-doctor.ts` 的在场性职责与退出码契约；
- 不把治理仓路径硬编码进 `lib/**`（`carrier` 由声明给出 ⇒ 使用方仓可用自己的 CI job 文件）。
