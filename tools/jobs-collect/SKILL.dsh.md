---
name: jobs-collect
description: 按 jobs-spec.json 的渠道与关键词，用浏览器检索真实招聘岗位（只读），把带 sourceUrl 的结果追加到 jobs-feed.jsonl。用于「检索岗位」「跑一遍岗位检索」或插件岗位页发起的查询会话。
---

# jobs-collect（DSH 版）

一次真实岗位检索 = 读规格 → 逐渠道浏览 → 按契约追加 feed → 汇报。
渠道、入口、字段都在 spec 里，skill 只负责编排，不夹带平台逻辑。

## 0. 先定位数据目录

DSH 工作台数据根（macOS）：

```
$DSH_HOME/dsh-upcv-workspace
# 即 ~/Library/Application Support/dsh-desktop/harness/dsh-upcv-workspace
```

- 规格：`<root>/jobs-spec.json`
- 收件箱：spec 里的 `feedPath`（绝对路径），通常 `<root>/jobs-feed.jsonl`

先确认能读（`test -r`）。读不到就停下报错，**不要自己编路径，也不要猜一份默认规格**。

## 1. 读 spec

确认这些字段：

- `channels`：只跑 `enabled: true` 的渠道
- `channels[].entry`：入口模板，含 `{keyword}` / `{city}`
- `channels[].maxPages`：单渠道页数，**代码里再钳到 2**
- `defaults.city` / `defaults.keywords`
- `feedPath`：绝对路径

关键词取用户给的；没给就用 `defaults.keywords.join(' ')`。城市一律取 `defaults.city`（界面不输入城市）。

如果任务里写了「本轮只跑这些渠道 id：…」，就只跑这些，其余渠道直接跳过（不要打开、不要试探）。

## 2. 浏览器从哪来

按优先级：

1. **浏览器 MCP**：工具名以 `mcp__browser__` 开头（Playwright MCP，连的是插件和用户共用的浏览器）。
   开始前先用 `browser_tabs` 新建一个标签（`action:"new"`）再导航；**不要动已有标签**——那可能是用户的登录页。
   检索结束不要 `browser_close`（会关掉用户的窗口），只关自己新建的标签。
2. 没有浏览器 MCP 时，退回本地采集器（若已安装）：

   ```bash
   node "$DSH_HOME/dsh-upcv-workspace/collector/collector.js" \
     --spec "$DSH_HOME/dsh-upcv-workspace/jobs-spec.json" --keyword "<关键词>"
   ```

   它自己写 feed 和 `collector-status.json`，跑完直接汇报即可。
3. 两者都没有：明确说「需要浏览器 MCP，或先安装采集器」。不要用 `web_fetch` 硬抓——它不执行 JS，招聘站基本抓不到。

## 3. 逐渠道检索

对每个 enabled 渠道：

1. 用 `encodeURIComponent` 替换 `{keyword}` / `{city}`，得到入口 URL；
2. 打开入口，等列表渲染稳定；
3. 提取岗位：优先 JSON-LD `JobPosting`，否则「链接文本 + 最近容器文本」启发式，**不写平台专属选择器**；
4. 必须进详情页才能拿到链接时，只做「打开 → 读 → 返回」，不点投递/沟通/收藏；
5. 单渠道最多 2 页，翻页只点「下一页」这类只读控件；
6. 遇到登录墙/验证码：**立即停止整轮**，报告 `login-required：<渠道 id>`；不要换入口、不要重试、不要继续其他渠道。
   登录由用户在岗位页「检索源」里完成，agent 不代登录、不绕过。

`browser_evaluate` 参考脚本（返回数组）：

```js
() => {
  const jobs = [];
  const seen = new Set();
  // 1) JSON-LD JobPosting
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const list = Array.isArray(data) ? data : (data['@graph'] || [data]);
      for (const node of list) {
        if (!node || node['@type'] !== 'JobPosting') continue;
        const url = node.url || (node.mainEntityOfPage && node.mainEntityOfPage['@id']);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const addr = node.jobLocation && node.jobLocation.address;
        const pay = node.baseSalary && node.baseSalary.value;
        jobs.push({
          sourceUrl: url,
          title: node.title || '',
          company: (node.hiringOrganization && node.hiringOrganization.name) || '',
          city: (addr && addr.addressLocality) || '',
          salary: pay ? String(pay.value ?? pay.minValue ?? '') : ''
        });
      }
    } catch {}
  }
  // 2) 启发式兜底
  if (jobs.length === 0) {
    for (const a of document.querySelectorAll('a[href]')) {
      const t = (a.textContent || '').trim();
      if (t.length < 4 || t.length > 60) continue;
      const href = a.href;
      if (!/^https?:/.test(href) || seen.has(href)) continue;
      const box = a.closest('li, article, div');
      seen.add(href);
      jobs.push({
        sourceUrl: href, title: t, company: '', city: '', salary: '',
        rawText: box ? (box.innerText || '').replace(/\s+/g, ' ').slice(0, 300) : ''
      });
    }
  }
  return jobs.slice(0, 40);
}
```

拿不到 `company` 的条目不要猜：写入前按契约筛掉并计数。

### 3.1 列表标题被字体混淆时（实习僧这类 Nuxt 站点）

实习僧列表页把标题渲染成私有区字符（`innerText` 读出来是空的/乱码），但页面状态里有结构化数据。
先判断：列表里取到的 title 少于 2 个汉字或看起来是符号，就走下面两步。

1. 列表优先用同源接口，每页 20 条：
   `fetch('/app/interns/search/v2?page=N&type=intern&keyword=…&city=…&area=&months=&days=&degree=&official=&enterprise=&salary=-0&publishTime=&sortType=&internExtend=', { credentials:'include' })`
   返回 `j.msg.data`；N 从 1 到 spec.maxPages（最多 2）。接口不可用再退回 `window.__NUXT__.data[0].interns.data`。
2. 标题不可读的，优先在**列表页里批量 fetch** 详情 HTML（同源、`credentials:'include'`），
   从 HTML 里取 `"iname":"..."` 和 `"salary_desc":"..."`；批量失败再逐页打开详情；
3. 每个详情只取一次，拿不到就跳过；单轮最多 40 条。

列表（接口，1..maxPages 页）：

```js
async () => {
  const params = new URLSearchParams({
    type: 'intern', keyword: '<关键词>', city: '<城市>',
    area: '', months: '', days: '', degree: '', official: '', enterprise: '',
    salary: '-0', publishTime: '', sortType: '', internExtend: ''
  });
  const all = [];
  for (let page = 1; page <= 2; page += 1) {
    params.set('page', String(page));
    const r = await fetch('/app/interns/search/v2?' + params.toString(), { credentials: 'include' });
    const j = await r.json();
    all.push(...(j.msg?.data || []));
  }
  return all.map((j) => ({
    sourceUrl: 'https://www.shixiseng.com/intern/' + j.uuid,
    title: j.name || '',
    company: j.cname || '',
    city: j.city || '',
    salary: j.minsalary && j.maxsalary ? (j.minsalary + '-' + j.maxsalary + '/天') : '',
    tags: j.i_tags || [],
    needDetail: true
  }));
}
```

列表（`__NUXT__` 兜底，接口不可用时）：

```js
() => {
  const list = window.__NUXT__?.data?.[0]?.interns?.data;
  if (!Array.isArray(list)) return null;
  return list.map((j) => ({
    sourceUrl: 'https://www.shixiseng.com/intern/' + j.uuid,
    title: j.name || '', company: j.cname || '', city: j.city || '',
    salary: j.minsalary && j.maxsalary ? (j.minsalary + '-' + j.maxsalary + '/天') : '',
    tags: j.i_tags || [], needDetail: true
  }));
}
```

批量取详情（在列表页执行，比逐个导航快）：

```js
async () => {
  const list = window.__NUXT__?.data?.[0]?.interns?.data ?? [];
  const out = [];
  for (const j of list) {
    const url = 'https://www.shixiseng.com/intern/' + j.uuid;
    const r = await fetch(url, { credentials: 'include' });
    const html = await r.text();
    out.push({
      sourceUrl: url,
      title: (html.match(/"iname":"([^"]+)"/) || [])[1] || '',
      company: j.cname || '',
      city: j.city || '',
      salary: (html.match(/"salary_desc":"([^"]+)"/) || [])[1] || '',
      tags: j.i_tags || []
    });
  }
  return out;
}
```

单页详情（批量失败时）：

```js
() => {
  const d = window.__NUXT__?.data?.[0];
  const m = d?.msg ?? d?.intern ?? d ?? {};
  return {
    title: m.iname ?? m.name ?? ((document.title || '').split('-')[0] || ''),
    company: m.cname ?? '',
    city: m.city ?? '',
    salary: m.salary_desc ?? '',
    tags: m.attraction ?? m.skills ?? []
  };
}
```

## 4. 追加 feed（唯一允许的写操作）

每条一行 JSON，字段名逐字一致：

```json
{"collectedAt":"2026-10-20T14:30:00+08:00","source":"shixiseng","sourceUrl":"https://www.shixiseng.com/intern/xxx","title":"前端实习","company":"某某科技","city":"深圳","salary":"250-400元/天","tags":["Vue"],"raw":{}}
```

- `source` 必须取自 `spec.channels[].id`；
- `sourceUrl` 缺失 → 整行丢弃并计数；
- `collectedAt` 用当前时间（ISO 8601 带时区）；
- 只追加，不覆盖。

```bash
cat >> "$FEED" <<'EOF'
{"..."}
EOF
```

写完用 `wc -l` 确认增长。

## 5. 汇报

- 每个渠道：提取 N 条、丢弃 M 条（缺 sourceUrl/company）、跑了几页；
- 追加总行数与 feed 绝对路径；
- 失败渠道与原因（登录墙/超时/结构变化）；
- 入库由插件负责：由岗位页「查询」发起的会话会自动 ingest；手动触发时提示回岗位页点「整理收件箱」。

## 红线

- 只读：不投递、不沟通、不收藏、不登录新账号、不解风控；
- 单渠道 ≤ 2 页（spec 写更多也要钳住）；
- 没链接不编、没公司不编、不归一化原始字段；
- 写盘只允许「向 feedPath 追加行」这一个动作。
