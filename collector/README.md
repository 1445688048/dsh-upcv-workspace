# 岗位检索采集器（collector）

这是 spec/feed 契约的**第三个客户端**（另外两个是 ZCode 薄 skill 与插件本身）。
它只读两个契约文件：读 `../jobs-spec.json` 决定渠道与入口，往 `../jobs-feed.jsonl` 追加结果。

## 安装

```bash
# 在插件仓库根目录运行（会把本目录复制到 <config.root>/collector/ 并独立安装 Playwright）
node scripts/setup-collector.mjs
# 只复制文件、不联网装依赖：
node scripts/setup-collector.mjs --no-install
```

Playwright **只装在 `<config.root>/collector/node_modules`**，不是插件依赖，也不进 tgz。
首次运行会弹出 headed 浏览器；登录一次后凭 `browser-profile/` 长期有效。

## 直接运行（调试用）

```bash
node collector.js --spec <config.root>/jobs-spec.json --keyword 前端
```

退出码：`0` 成功 / `1` 检索出错 / `2` 参数或单实例问题 / `124` 超时。

## 红线

- 只读不写：不点投递、不发消息、不登录新账号；
- 单渠道单轮不超过 `maxPages`（代码里再钳到 2）；
- 无 `sourceUrl` 或拿不到公司名的条目不写入（不编造）；
- 不含任何平台选择器：提取只走 JSON-LD `JobPosting` 与通用链接/容器启发式。
