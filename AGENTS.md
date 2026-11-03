# AGENTS.md — 所有会话生效

请用中文输出。

## 临时目录

临时文件、scratch 脚本、调试输出写到 `/tmp/opencode/<name>`。
**不要用 `/tmp`** —— OpenCode 默认拒绝通用系统临时目录,会导致读写失败。

---

## Build Agent 角色矩阵

**本矩阵只属于 build agent**，已移到 `prompts/build.md` 的「角色矩阵」段。

原因：AGENTS.md 会注入**所有** agent 的上下文。矩阵放在这里时，explore / librarian / oracle / metis / general / critic / context-builder 也会读到「每回合必须输出开场报告」的要求 —— 与它们各自 prompt 里「只输出固定小节、不要开场白」直接冲突，输出结构会不稳。

- **build agent** → 读 `prompts/build.md` 的「角色矩阵」段并遵守
- **其它 agent** → **完全忽略**一切角色相关内容（开场报告格式、角色切换、越权处理）
