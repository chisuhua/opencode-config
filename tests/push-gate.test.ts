/**
 * push-gate —— **层 1b 纯逻辑单测**（`docs/adr/ADR-commit-verification-gate.md` D4 / D9⑧）
 *
 * 覆盖：force push 的**六形态**（ADR Rev 2 / 2.1 的 D4 判定表 S1–S5）
 * —— config `deny`（8 条）的**严格超集**：还覆盖短选项簇（`-uf`）、`+refspec`、`--mirror`（含缩写）、
 * 带引号形态，以及 config 的 glob 表达不了的选项值形态（`-o +ci` ⇒ **不**误判）。
 */
import { describe, expect, test } from "bun:test"

import { detectForcePush } from "../lib/push-gate.ts"

describe("D4 force push 六形态（工具层兜底 ⇒ 拒）", () => {
  const forced = [
    "git push --force origin main",
    "git push --force",
    "git push -f",
    "git push -f origin main",
    "git push origin main --force",
    "git push origin main -f",
    "git push --force-with-lease",
    "git push --force-with-lease=main",
    "git push --force-if-includes",
    "git push -uf origin main", // 短选项簇里含 `f`
    // ── Rev 2 新增形状（S1–S4）──
    "git push origin +main", // `+refspec` = 强制更新该 ref
    "git push origin +a:b",
    "git push --mirror origin", // 全 ref 推送 + 删远端多余 ref
    "git push --mirro", // git 允许**长选项缩写**（实测被接受为 `--mirror`）
    "git push origin \"+main\"", // 带引号形态（shell 去引号后即真身）
    "git push \"--force\"",
    '"git" push +main', // 引号包住的 **git 命令词**
    'git "push" --force', // 引号包住的 **子命令**
    "git -c k=v push +main", // 全局选项在 push 之前
    "git --no-pager push +main",
  ]
  for (const cmd of forced) {
    test(`拒：${cmd}`, () => {
      const r = detectForcePush(cmd)
      expect(r.isForcePush, `未识别为 force push：${cmd}`).toBe(true)
      expect(r.reason).toBeTruthy()
    })
  }
})

describe("负向矩阵（不得误伤）", () => {
  const allowed = [
    "git push origin main",
    "git push",
    "git push --set-upstream origin main",
    "git push -u origin main",
    "git push origin main --tags",
    'echo "git push --force"',
    "git commit -m x",
    "git log --grep force",
    // ── 反向判据（S5：带值选项的值不是强推标志）──
    "git push -o +ci origin main",
    "git push -o+ci origin main",
    "git push -oquickfix origin main", // `-o` 的附着值里含 `f` ⇒ 不得误判
    "git push --push-option=+ci origin main",
    "git push --push-option +ci origin main",
    "git push --receive-pack +x origin main",
    "git push --exec +x origin main",
    "git push --repo +x origin main",
    "git push --no-force-with-lease origin main", // `--no-*` 天然不匹配前缀
    // ── 选项终止符 / 带值选项的**缩写**（S1 双向前缀匹配的反向判据）──
    "git push origin -- main", // `--` 是选项终止符，不是长选项
    "git push --push-o +ci origin main", // 带值长选项的缩写 ⇒ 值（+ci）要跳过
    // ── 删除类（D9⑭：用户裁决不入强推口径）──
    "git push origin :old",
    "git push --delete old",
    "git push -d old",
    "git push --prune",
  ]
  for (const cmd of allowed) {
    test(`放行：${cmd}`, () => {
      const r = detectForcePush(cmd)
      expect(r.isForcePush, `误判为 force push：${cmd}`).toBe(false)
      expect(r.reason).toBeUndefined()
    })
  }
})

describe("AC9 heredoc 正文是数据（不误判强推）", () => {
  test("heredoc 正文里提到强推字面量 ⇒ 不拦", () => {
    const cmd = "cat <<'EOF'\ngit push --force origin main\nEOF"
    expect(detectForcePush(cmd).isForcePush, "heredoc 正文被当成真命令 ⇒ 误拒").toBe(false)
  })
  test("heredoc **之外**的真实强推 ⇒ 仍拒", () => {
    const cmd = "cat <<'EOF'\ntext\nEOF\ngit push --force origin main"
    expect(detectForcePush(cmd).isForcePush).toBe(true)
  })
})

describe("复合命令（任一段是 force push ⇒ 拒）", () => {
  test("`git commit -m x; git push --force origin main` ⇒ 拒", () => {
    expect(detectForcePush("git commit -m x; git push --force origin main").isForcePush).toBe(true)
  })
  test("`git status && git push origin main` ⇒ 放行", () => {
    expect(detectForcePush("git status && git push origin main").isForcePush).toBe(false)
  })
})
