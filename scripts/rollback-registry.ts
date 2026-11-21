#!/usr/bin/env bun
/**
 * rollback-registry —— **机制登记表**的一致性检查（CLI 出口）
 *
 * 用法：
 *   bun scripts/rollback-registry.ts [--repo <dir>] [--json]
 *
 * 退出码：
 *   0 = 全部判据通过（并打印五态 census）
 *   1 = 有判据不通过（逐条打印 **判据编号 + 机制 + 详情**）
 *   2 = registry 缺失 / schema 非法（**不可判定**，不当通过）
 *
 * ⚠ **不在套件里跑本 CLI**（spawn 进程 ⇒ 违反「零成本」）；套件走 `lib/rollback-registry.ts` 的纯逻辑层。
 * 本 CLI 的用途：人读（census + 逐条报错）与 CI 路径。
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  REGISTRY_PATH,
  RegistryError,
  checkRegistry,
  parseRegistry,
} from "../lib/rollback-registry.ts"

const args = process.argv.slice(2)
let repo = process.cwd()
let asJson = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--repo") repo = args[++i] ?? repo
  else if (args[i] === "--json") asJson = true
  else if (args[i] === "-h" || args[i] === "--help") {
    process.stdout.write("用法: rollback-registry [--repo <dir>] [--json]\n")
    process.exit(0)
  }
}

const regPath = path.join(repo, REGISTRY_PATH)
if (!existsSync(regPath)) {
  process.stderr.write(`✗ 缺 registry：${REGISTRY_PATH}（本仓的机制登记表未建立 ⇒ 强制化未生效）\n`)
  process.exit(2)
}

let reg
try {
  reg = parseRegistry(readFileSync(regPath, "utf8"))
} catch (e) {
  const msg = e instanceof RegistryError ? `${e.code}：${e.message}` : String(e)
  process.stderr.write(`✗ registry 非法：${msg}\n`)
  process.exit(2)
}

const { problems, census } = checkRegistry(repo, reg)

if (asJson) {
  process.stdout.write(JSON.stringify({ census, problems }, null, 2) + "\n")
} else {
  const c = Object.entries(census)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
  process.stdout.write(`census: ${c}\n`)
  for (const p of problems) {
    process.stdout.write(`  ✗ [${p.code}] ${p.mechanism}：${p.detail}\n`)
  }
  if (problems.length === 0) process.stdout.write("PASS: 机制登记表一致\n")
}

process.exit(problems.length === 0 ? 0 : 1)
