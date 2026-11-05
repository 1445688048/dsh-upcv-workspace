/**
 * 真实岗位检索闭环（jobs feed）：插件侧的摄取、去重、归一化与状态管理。
 *
 * 信箱模式：外部 harness（ZCode 薄 skill）按 jobs-spec.json 检索招聘平台，
 * 把带 sourceUrl 的结构化岗位逐行追加到 jobs-feed.jsonl；本模块负责
 * 摄取（丢弃无 sourceUrl 行）→ 去重（主键 sourceUrl，回落 公司+职位+城市）→
 * 入库 jobs.json（原子写，容量 500）→ feed 轮转改名。
 *
 * 整条链路不依赖 LLM：没有模型时摄取、筛选、直链跳转、状态标记全部可用。
 * 两个契约文件的字段定义见 docs/JOBS-FEED-PLAN.md 第 3 节，字段名不得自行变更。
 *
 * @module dsh-upcv-workspace/jobs
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 岗位库单文件容量上限；超出时按 collectedAt 最旧优先删除 new 条目。 */
const MAX_JOBS = 500;

/** status 的合法取值（3.3）。 */
const JOB_STATUSES = Object.freeze(['new', 'applied', 'dismissed']);

/** 日薪折月用的法定月计薪天数。 */
const WORK_DAYS_PER_MONTH = 21.75;

/** 无 sourceUrl、来源、时间戳之外的任何坏行都只计数跳过，不让摄取整体失败。 */

/** 生成一个够用的 id（与 store 一致：时间戳 + 随机后缀）。 */
function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** 原子写：先写 .tmp 再 rename，避免半截 JSON（与 store.writeRaw 同一手法）。 */
function atomicWrite(file, text) {
  const tmp = file + '.tmp';
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

/** 读 JSON 文件；任何异常都返回 null 并附原因，不让调用方崩溃。 */
function readJson(file, maxBytes = 8 * 1024 * 1024) {
  if (!existsSync(file)) return { value: null, note: 'empty' };
  try {
    if (statSync(file).size > maxBytes) return { value: null, note: 'oversized' };
    return { value: JSON.parse(readFileSync(file, 'utf8')), note: 'ok' };
  } catch {
    return { value: null, note: 'corrupt' };
  }
}

// ── 归一化 ─────────────────────────────────────────────────────────────

/**
 * 薪资原文 → 月薪区间；解析不了就返回 null（保留原文，不猜）。
 *
 * 支持（4.2 的全部分支）：
 *   "15-25K" / "15-25k·13薪"      → {min:15000, max:25000, period:'month'}
 *   "1.5-2万"                     → {min:15000, max:20000, period:'month'}
 *   "15-25万/年"                  → 年薪除以 12 折月
 *   "250-400元/天"                → 按 21.75 个计薪工作日折月（5437–8700）
 *   "面议" / 乱串 / 空            → null
 */
export function normalizeSalary(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  // 两个数之间的分隔符：- – — ~ ～ 至；单位可能只在一侧（"15-25K"）或两侧各异（"8千-1.2万"）
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(万\/年|万|千|k|K|元\/天|元\/日|元\/月)?\s*(?:[-–—~～至]\s*(\d+(?:\.\d+)?)\s*(万\/年|万|千|k|K|元\/天|元\/日|元\/月)?)?\s*(万\/年|元\/天|元\/日|元\/月)?/
  );
  if (match === null) return null;
  const first = Number(match[1]);
  const second = match[3] === undefined ? null : Number(match[3]);
  if (!Number.isFinite(first)) return null;
  const firstUnit = match[2];
  const secondUnit = match[4];
  const suffixUnit = match[5];
  const toMonthly = (value, unit) => {
    switch (unit) {
      case '万/年': return (value * 10000) / 12;
      case '万': return value * 10000;
      case '千':
      case 'k':
      case 'K': return value * 1000;
      case '元/天':
      case '元/日': return value * WORK_DAYS_PER_MONTH;
      case '元/月': return value;
      default: return value;
    }
  };
  // 两侧单位各自解析；只有一侧带单位时另一侧沿用（"15-25K"、"250-400元/天"）
  const minUnit = firstUnit ?? secondUnit ?? suffixUnit ?? '';
  const maxUnit = secondUnit ?? suffixUnit ?? firstUnit ?? '';
  const min = toMonthly(first, minUnit);
  const max = second === null ? min : toMonthly(second, maxUnit);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null;
  // 没有任何单位的裸数字（如 JD 里混进来的"3-5"年经验）不可能构成月薪，判为解析失败
  if (minUnit === '' && Math.max(min, max) < 1000) return null;
  return { min: Math.floor(min), max: Math.floor(Math.max(min, max)), period: 'month' };
}

/** 城市别名表：只放必要项（v1 以深圳为主），不要预填一份全国字典。 */
const CITY_ALIASES = Object.freeze({
  sz: '深圳',
  shenzhen: '深圳',
});

/**
 * 城市原文 → 归一化城市名：取分隔符前的主城市、去「市」、查别名表。
 * "深圳-南山区" → "深圳"；"深圳市" → "深圳"；"sz" → "深圳"；空 → ''。
 */
export function normalizeCity(raw) {
  let text = String(raw ?? '').trim();
  if (text === '') return '';
  // 平台常见「城市-区」「城市·商圈」写法：只留主城市段
  const head = text.split(/[-·/、\s]/)[0] || text;
  text = head.replace(/市$/, '');
  const alias = CITY_ALIASES[text.toLowerCase()];
  return alias !== undefined ? alias : text;
}

/**
 * 回落去重键用的文本归一：全角→半角、去空格、去括号备注（括号内整段删除）、小写。
 * 用于 公司+职位+城市 的宽松匹配，命中只记 duplicates、不覆盖原条目。
 */
function normText(value) {
  let text = String(value ?? '');
  text = text.replace(/[\uFF01-\uFF5E\u3000]/g, (ch) =>
    ch === '\u3000' ? '' : String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
  text = text.replace(/（[^）]*）/g, '').replace(/\([^()]*\)/g, '');
  text = text.replace(/[〔〕\[\]【】]/g, '');
  text = text.replace(/\s+/g, '');
  return text.toLowerCase();
}

/** 回落去重键：归一化(公司) + 归一化(职位) + cityNorm。 */
function fallbackKey(entry) {
  return normText(entry?.company) + '|' + normText(entry?.title) + '|' + normText(entry?.cityNorm);
}

// ── spec（契约①）──────────────────────────────────────────────────────

/** 3.2 的默认检索规格：v1 只放实习僧 + 猎聘，不含 BOSS；feedPath 写绝对路径。 */
export function defaultSpec(root) {
  return {
    version: 1,
    feedPath: join(String(root ?? ''), 'jobs-feed.jsonl'),
    defaults: { city: '深圳', keywords: ['前端'] },
    channels: [
      {
        id: 'shixiseng',
        enabled: true,
        entry: 'https://www.shixiseng.com/s?k={keyword}&city={city}',
        maxPages: 1,
        fields: ['title', 'company', 'city', 'salary', 'sourceUrl', 'tags'],
      },
      {
        id: 'liepin',
        enabled: true,
        entry: 'https://www.liepin.com/city-深圳/{keyword}/',
        maxPages: 1,
        fields: ['title', 'company', 'city', 'salary', 'sourceUrl'],
      },
    ],
    rules: '只读不写：不点投递、不碰会话窗口；无 sourceUrl 不入库；单渠道单轮不超过 maxPages',
  };
}

/**
 * 保证 jobs-spec.json 存在：不存在写默认版；存在绝不覆盖；
 * 坏 JSON 保留原文件并返回错误（用户手工数据优先，绝不自动重写）。
 * @returns {{spec: object, created: boolean} | {error: string, message: string}}
 */
export function ensureSpec(root) {
  if (typeof root !== 'string' || root === '') return { error: 'store-unavailable', message: '没有配置数据根目录。' };
  const file = join(root, 'jobs-spec.json');
  if (!existsSync(file)) {
    mkdirSync(root, { recursive: true });
    const spec = defaultSpec(root);
    atomicWrite(file, JSON.stringify(spec, null, 2) + '\n');
    return { spec: spec, created: true };
  }
  const read = readJson(file);
  if (read.note !== 'ok' || read.value === null || typeof read.value !== 'object' || Array.isArray(read.value)) {
    return { error: 'spec-invalid', message: 'jobs-spec.json 不是合法 JSON，已保留原文件，请手工修复。' };
  }
  return { spec: read.value, created: false };
}

// ── jobs.json（契约③ 插件所有）────────────────────────────────────────

function jobsPath(root) {
  return join(root, 'jobs.json');
}

/** 读岗位库：损坏/超大当空集合（沿用 store「异常当空集合 + 原因」模式）。 */
function readJobs(root) {
  return readJson(jobsPath(root));
}

/** 按 collectedAt 倒序（无效时间排最后）。 */
function byCollectedDesc(a, b) {
  const ta = Date.parse(a?.collectedAt ?? '');
  const tb = Date.parse(b?.collectedAt ?? '');
  const va = Number.isNaN(ta) ? -1 : ta;
  const vb = Number.isNaN(tb) ? -1 : tb;
  return vb - va;
}

/** 读正式岗位库并按 collectedAt 倒序返回。 */
export function loadJobs(root) {
  const read = readJobs(root);
  const items = Array.isArray(read.value) ? read.value : [];
  return { items: items.slice().sort(byCollectedDesc), note: read.note };
}

/**
 * 摄取 jobs-feed.jsonl：去重入库 → 轮转。
 *
 * 每行处理规则（3.1 / 4.2）：
 *   - JSON 解析失败 / 不是对象 → badLines +1，跳过（容忍末尾残行）；
 *   - 缺 sourceUrl → dropped +1，丢弃；
 *   - 缺 collectedAt → 用 now 补齐并记 warning；
 *   - 主键 sourceUrl（trim 后精确匹配）命中库内或本批已有 → duplicates +1；
 *   - 回落键 归一化(公司)+归一化(职位)+cityNorm 命中 → duplicates +1，不覆盖原条目；
 *   - 其余补 salaryRange / cityNorm / status:'new' 后入库。
 *
 * 入库后轮转：feed 改名为 jobs-feed.done-<时间戳>.jsonl（保留同目录）。
 * @returns {{added:number, duplicates:number, dropped:number, badLines:number,
 *            lastCollectedAt:string|null, trimmed:number, warnings:string[]}}
 */
export function ingestFeed({ root, now }) {
  const stats = { added: 0, duplicates: 0, dropped: 0, badLines: 0, lastCollectedAt: null, trimmed: 0, warnings: [] };
  if (typeof root !== 'string' || root === '') {
    stats.warnings.push('没有配置数据根目录，未摄取。');
    return stats;
  }
  const feedFile = join(root, 'jobs-feed.jsonl');
  if (!existsSync(feedFile)) {
    stats.warnings.push('收件箱为空：没有待整理的新结果（会话式检索的结果会自动入库）。');
    return stats;
  }

  let content = '';
  try {
    content = readFileSync(feedFile, 'utf8');
  } catch (error) {
    stats.warnings.push('读取 jobs-feed.jsonl 失败：' + String(error));
    return stats;
  }

  const existing = readJobs(root).value;
  const store = Array.isArray(existing) ? existing : [];
  const primarySeen = new Set(store.map((item) => (typeof item?.sourceUrl === 'string' ? item.sourceUrl.trim() : '')));
  const fallbackSeen = new Set(store.map(fallbackKey));
  const appended = [];
  let lastTs = Number.NaN;

  for (const line of content.split('\n')) {
    const text = line.trim();
    if (text === '') continue; // 空行（含末尾换行）不算坏行
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      stats.badLines += 1;
      continue;
    }
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      stats.badLines += 1;
      continue;
    }
    if (typeof row.collectedAt === 'string' && row.collectedAt !== '' && !Number.isNaN(Date.parse(row.collectedAt))) {
      const ts = Date.parse(row.collectedAt);
      if (Number.isNaN(lastTs) || ts > lastTs) lastTs = ts;
    }
    const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl.trim() : '';
    if (sourceUrl === '') {
      stats.dropped += 1; // 数据诚实：无链接的条目一律丢弃并报告，绝不编造
      continue;
    }
    let collectedAt = typeof row.collectedAt === 'string' && row.collectedAt !== '' ? row.collectedAt : null;
    if (collectedAt === null || Number.isNaN(Date.parse(collectedAt))) {
      collectedAt = now;
      stats.warnings.push('一行缺少 collectedAt，已按当前时间补齐。');
    }
    // 主键去重（同批重复与重复入库同一 URL 都只计 duplicates）
    if (primarySeen.has(sourceUrl)) {
      stats.duplicates += 1;
      continue;
    }
    const cityNorm = normalizeCity(row.city);
    const candidate = { company: row.company, title: row.title, cityNorm: cityNorm };
    if (fallbackSeen.has(fallbackKey(candidate))) {
      stats.duplicates += 1; // 回落命中：不覆盖原条目
      continue;
    }
    primarySeen.add(sourceUrl);
    fallbackSeen.add(fallbackKey(candidate));
    appended.push({
      id: newId(),
      collectedAt: collectedAt,
      source: typeof row.source === 'string' ? row.source : '',
      sourceUrl: sourceUrl,
      title: typeof row.title === 'string' ? row.title : '',
      company: typeof row.company === 'string' ? row.company : '',
      city: typeof row.city === 'string' ? row.city : '',
      salary: typeof row.salary === 'string' ? row.salary : '',
      salaryRange: normalizeSalary(row.salary),
      cityNorm: cityNorm,
      tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
      status: 'new',
      statusAt: null,
      raw: row.raw !== null && typeof row.raw === 'object' && !Array.isArray(row.raw) ? row.raw : {},
    });
    stats.added += 1;
  }

  let merged = appended.concat(store);
  // 容量 500：超出时按 collectedAt 最旧优先删 new；applied/dismissed 永不自动删
  if (merged.length > MAX_JOBS) {
    const order = merged
      .map((item, index) => ({ index: index, item: item }))
      .sort((a, b) => byCollectedDesc(a.item, b.item) || a.index - b.index);
    const doomed = new Set();
    for (let i = order.length - 1; i >= 0 && merged.length - doomed.size > MAX_JOBS; i -= 1) {
      if (order[i].item?.status === 'new') doomed.add(order[i].index);
    }
    stats.trimmed = doomed.size;
    merged = merged.filter((_, index) => !doomed.has(index));
  }
  if (appended.length > 0) {
    mkdirSync(root, { recursive: true });
    atomicWrite(jobsPath(root), JSON.stringify(merged, null, 2));
  }
  stats.lastCollectedAt = Number.isNaN(lastTs) ? null : new Date(lastTs).toISOString();

  // feed 轮转：改名保留，检索方下一轮往新文件里追加
  if (content !== '') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      renameSync(feedFile, join(root, 'jobs-feed.done-' + stamp + '.jsonl'));
    } catch (error) {
      stats.warnings.push('feed 轮转失败（内容已入库，文件保留原位）：' + String(error));
    }
  }
  return stats;
}

/**
 * 更新一条岗位的状态（new | applied | dismissed），并记 statusAt。
 * @returns {{item: object} | {error: string, message?: string}}
 */
export function updateJobStatus(root, id, status, now) {
  if (typeof root !== 'string' || root === '') return { error: 'store-unavailable', message: '没有配置数据根目录。' };
  if (typeof id !== 'string' || id === '') return { error: 'not-found' };
  if (!JOB_STATUSES.includes(status)) {
    return { error: 'invalid-status', message: '状态只能是 new / applied / dismissed。' };
  }
  const read = readJobs(root);
  const items = Array.isArray(read.value) ? read.value : [];
  const index = items.findIndex((item) => item?.id === id);
  if (index === -1) return { error: 'not-found' };
  const updated = { ...items[index], status: status, statusAt: now };
  const next = items.slice();
  next[index] = updated;
  mkdirSync(root, { recursive: true });
  atomicWrite(jobsPath(root), JSON.stringify(next, null, 2));
  return { item: updated };
}
