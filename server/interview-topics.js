/**
 * 知识点标签体系：内置词表 + 同义折叠（docs/INTERVIEW-V2-PLAN.md 第 4 节）。
 *
 * 纯数据模块，不依赖任何宿主能力。两条铁律：
 * - 词表是**引导**不是白名单：生题 prompt 附节选引导模型优先选用；
 *   用户/模型给出未知标签时原样入库，绝不丢弃用户的表达。
 * - 同义折叠防标签爆炸：`React性能`、`js事件循环` 这类变体归一到词表里的规范写法。
 *
 * 界面上的筛选项一律从库内数据聚合，**不读这里的死词表**。
 *
 * @module dsh-upcv-workspace/interview-topics
 */

/** 按方向分组的内置词表（prompt 里引用分组名与代表标签）。 */
export const TOPIC_GROUPS = Object.freeze([
  {
    group: 'JS 语言',
    topics: ['事件循环', 'Promise', 'async/await', '闭包', '原型链', 'this 指向', '防抖节流', '深浅拷贝', 'ES6+', 'TypeScript', '内存管理'],
  },
  {
    group: '框架',
    topics: ['React 原理', 'React Hooks', 'Vue 原理', '状态管理', '虚拟 DOM 与 diff', '前端路由', '组件设计'],
  },
  {
    group: '工程',
    topics: ['前端性能优化', '构建工具', '前端工程化', '微前端', '前端监控', 'CSS 布局', '浏览器缓存', '浏览器渲染', '前端安全', '移动端适配'],
  },
  {
    group: '网络',
    topics: ['HTTP 协议', 'HTTPS', 'TCP/UDP', 'DNS', 'CDN', 'WebSocket'],
  },
  {
    group: '后端通识',
    topics: ['操作系统', '并发编程', '数据库索引', '事务与隔离', '缓存架构', '消息队列', '分布式理论', '分布式事务', '系统设计', '高可用架构', 'API 设计', 'Redis', 'MySQL', 'MongoDB', 'RabbitMQ', 'Kafka', 'Elasticsearch', 'Nacos', 'MyBatis-Plus', 'JWT']
  },
  {
    group: '数据与算法',
    topics: ['SQL', '数据结构', '算法基础', '机器学习基础', '深度学习', '大模型', '统计学基础', '实验设计', '数据分析方法', '指标体系', '数据仓库', '推荐系统'],
  },
  {
    group: '产品与业务',
    topics: ['需求分析', '产品设计', '增长与留存', '数据驱动', '竞品分析', '商业化', '用户研究', '项目与协作', '指标异动归因', 'A/B 实验'],
  },
  {
    group: '软素质',
    topics: ['自我认知', '求职动机', '项目复盘', '协作沟通', '学习能力', '抗压与心态', '职业规划'],
  },
]);

/** 词表里所有规范标签的集合（含分组名，供 prompt 节选与折叠表校验）。 */
export const CANONICAL_TOPICS = Object.freeze(
  TOPIC_GROUPS.flatMap((group) => group.topics)
);

/**
 * 同义折叠映射表：变体写法 → 规范标签。
 * 键在 normalizeTags 里做「去空白 + 小写」后匹配，所以 'React性能' 与 'react 性能' 等价。
 * 目标值必须是 CANONICAL_TOPICS 里的成员（构造时校验，写错直接让模块加载失败）。
 */
const SYNONYM_SOURCE = Object.freeze({
  // JS 语言
  '事件循环机制': '事件循环',
  'eventloop': '事件循环',
  'event loop': '事件循环',
  'js事件循环': '事件循环',
  'promise链': 'Promise',
  'promise': 'Promise',
  'promsie': 'Promise',
  '异步编程': 'async/await',
  'async': 'async/await',
  'await': 'async/await',
  '闭包与作用域': '闭包',
  'js闭包': '闭包',
  '作用域链': '闭包',
  '原型与继承': '原型链',
  '原型': '原型链',
  '继承': '原型链',
  'js基础': 'ES6+',
  'es6': 'ES6+',
  'typescript基础': 'TypeScript',
  'ts': 'TypeScript',
  '防抖': '防抖节流',
  '节流': '防抖节流',
  'debounce': '防抖节流',
  'throttle': '防抖节流',
  '深拷贝': '深浅拷贝',
  '浅拷贝': '深浅拷贝',
  '内存泄漏': '内存管理',
  'gc': '内存管理',
  '垃圾回收': '内存管理',
  // 框架
  'react': 'React 原理',
  'react原理': 'React 原理',
  'react性能': 'React 原理',
  'react性能优化': 'React 原理',
  'fiber': 'React 原理',
  '虚拟dom': '虚拟 DOM 与 diff',
  'diff算法': '虚拟 DOM 与 diff',
  'hooks': 'React Hooks',
  'reacthooks': 'React Hooks',
  'usememo': 'React Hooks',
  'vue': 'Vue 原理',
  'vue原理': 'Vue 原理',
  'vue响应式': 'Vue 原理',
  'vuex': '状态管理',
  'redux': '状态管理',
  'pinia': '状态管理',
  '路由': '前端路由',
  'react-router': '前端路由',
  '组件通信': '组件设计',
  '组件库': '组件设计',
  // 工程
  '性能优化': '前端性能优化',
  '首屏优化': '前端性能优化',
  'webpack': '构建工具',
  'vite': '构建工具',
  '打包优化': '构建工具',
  '工程化': '前端工程化',
  'ci/cd': '前端工程化',
  '微前端架构': '微前端',
  '埋点': '前端监控',
  '监控告警': '前端监控',
  'css': 'CSS 布局',
  'bfc': 'CSS 布局',
  'flex布局': 'CSS 布局',
  'grid布局': 'CSS 布局',
  '缓存': '浏览器缓存',
  '缓存策略': '浏览器缓存',
  '重排重绘': '浏览器渲染',
  '渲染原理': '浏览器渲染',
  'crp': '浏览器渲染',
  'xss': '前端安全',
  'csrf': '前端安全',
  'csp': '前端安全',
  '跨域': '前端安全',
  '1px': '移动端适配',
  'rem适配': '移动端适配',
  '响应式布局': '移动端适配',
  // 网络
  'http': 'HTTP 协议',
  'http1.1': 'HTTP 协议',
  'http2': 'HTTP 协议',
  'http3': 'HTTP 协议',
  '网络协议': 'HTTP 协议',
  'tls': 'HTTPS',
  'ssl': 'HTTPS',
  'https握手': 'HTTPS',
  'tcp': 'TCP/UDP',
  'udp': 'TCP/UDP',
  '三次握手': 'TCP/UDP',
  '域名解析': 'DNS',
  'cdn加速': 'CDN',
  '长连接': 'WebSocket',
  'socket': 'WebSocket',
  // 后端通识
  '进程线程': '操作系统',
  '进程与线程': '操作系统',
  'io多路复用': '操作系统',
  '虚拟内存': '操作系统',
  '线程池': '并发编程',
  '锁': '并发编程',
  '死锁': '并发编程',
  '协程': '并发编程',
  '索引': '数据库索引',
  'b+树': '数据库索引',
  '慢查询': '数据库索引',
  'mysql': 'MySQL',
  '事务': '事务与隔离',
  'acid': '事务与隔离',
  'mvcc': '事务与隔离',
  '隔离级别': '事务与隔离',
  'redis': 'Redis',
  '缓存穿透': '缓存架构',
  '缓存一致性': '缓存架构',
  '缓存雪崩': '缓存架构',
  'mq': '消息队列',
  'rabbitmq': 'RabbitMQ',
  'elasticsearch': 'Elasticsearch',
  'es检索': 'Elasticsearch',
  'mongodb': 'MongoDB',
  'mongo': 'MongoDB',
  'nacos': 'Nacos',
  'jwt': 'JWT',
  'mybatis-plus': 'MyBatis-Plus',
  'mybatisplus': 'MyBatis-Plus',
  'kafka': 'Kafka',
  '消息不丢失': '消息队列',
  'cap': '分布式理论',
  'cap理论': '分布式理论',
  '分布式一致性': '分布式理论',
  '分布式锁': '分布式理论',
  '分布式id': '分布式理论',
  'seata': '分布式事务',
  'tcc': '分布式事务',
  '微服务': '系统设计',
  '秒杀系统': '系统设计',
  '短链系统': '系统设计',
  '熔断限流': '高可用架构',
  '灰度发布': '高可用架构',
  '服务降级': '高可用架构',
  'restful': 'API 设计',
  '接口设计': 'API 设计',
  '幂等': 'API 设计',
  // 数据与算法
  'sql优化': 'SQL',
  '窗口函数': 'SQL',
  'join': 'SQL',
  '链表': '数据结构',
  '哈希表': '数据结构',
  '二叉树': '数据结构',
  '红黑树': '数据结构',
  '排序算法': '算法基础',
  '动态规划': '算法基础',
  'leetcode': '算法基础',
  '手写算法': '算法基础',
  '过拟合': '机器学习基础',
  '逻辑回归': '机器学习基础',
  'svm': '机器学习基础',
  'xgboost': '机器学习基础',
  '特征工程': '机器学习基础',
  'cnn': '深度学习',
  'rnn': '深度学习',
  'lstm': '深度学习',
  'transformer': '深度学习',
  '注意力机制': '深度学习',
  'llm': '大模型',
  'bert': '大模型',
  'gpt': '大模型',
  'lora': '大模型',
  '大模型微调': '大模型',
  '假设检验': '统计学基础',
  'p值': '统计学基础',
  '置信区间': '统计学基础',
  '中心极限定理': '统计学基础',
  'ab测试': 'A/B 实验',
  'ab实验': 'A/B 实验',
  '样本量': '实验设计',
  '辛普森悖论': '实验设计',
  '漏斗分析': '数据分析方法',
  '留存分析': '数据分析方法',
  '相关性与因果': '数据分析方法',
  '数仓': '数据仓库',
  '维度建模': '数据仓库',
  'etl': '数据仓库',
  '召回排序': '推荐系统',
  '协同过滤': '推荐系统',
  '冷启动': '推荐系统',
  // 产品与业务
  '需求评审': '需求分析',
  'prdd': '需求分析',
  'prd': '需求分析',
  'mvp': '需求分析',
  '用户故事': '需求分析',
  '功能设计': '产品设计',
  '交互设计': '产品设计',
  '产品设计思维': '产品设计',
  '增长模型': '增长与留存',
  'aarr': '增长与留存',
  'aarr模型': '增长与留存',
  '北极星指标': '增长与留存',
  '留存优化': '增长与留存',
  '数据驱动决策': '数据驱动',
  '指标设计': '指标体系',
  '指标口径': '指标体系',
  'osm模型': '指标体系',
  '竞品': '竞品分析',
  'swot': '竞品分析',
  '商业模式': '商业化',
  '变现': '商业化',
  '用户访谈': '用户研究',
  '问卷设计': '用户研究',
  '用户调研': '用户研究',
  '项目管理': '项目与协作',
  '跨部门协作': '项目与协作',
  '需求优先级': '项目与协作',
  '异动分析': '指标异动归因',
  '归因分析': '指标异动归因',
  // 软素质
  '自我介绍': '自我认知',
  '优缺点': '自我认知',
  '为什么选择': '求职动机',
  '离职原因': '求职动机',
  '最有挑战的项目': '项目复盘',
  '失败经历': '项目复盘',
  '团队协作': '协作沟通',
  '分歧处理': '协作沟通',
  '说服他人': '协作沟通',
  '学习方法': '学习能力',
  '技术选型学习': '学习能力',
  '抗压': '抗压与心态',
  '加班看法': '抗压与心态',
  '职业发展规划': '职业规划',
  '五年规划': '职业规划',
});

/** 构造时自证：每个折叠目标都必须是词表成员，写错直接抛错而不是带病上线。 */
for (const target of Object.values(SYNONYM_SOURCE)) {
  if (!CANONICAL_TOPICS.includes(target)) {
    throw new Error('interview-topics: 同义折叠目标不在词表里：' + target);
  }
}

/** 折叠键：去所有空白 + 小写，让「React性能 / react 性能 / React 性能」命中同一条。 */
function foldKey(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

const SYNONYMS = new Map(Object.entries(SYNONYM_SOURCE).map(([variant, canonical]) => [foldKey(variant), canonical]));

/** 单个标签允许的最大长度：超出按原样保留但截断，防止把整段 JD 塞进来。 */
const MAX_TAG_CHARS = 24;
/** 一道题最多保留多少个标签（prompt 要求 1-3 个，这里放宽到 4 做兜底）。 */
export const MAX_TAGS_PER_QUESTION = 4;

/**
 * 标签归一：trim → 同义折叠 → 去重 → 截断长度 → 限量。
 * 未知标签原样入库（词表是引导不是白名单）；非字符串与空值丢弃。
 * @param {unknown} input 任意形状（期望字符串数组）
 * @returns {string[]}
 */
export function normalizeTags(input) {
  const list = Array.isArray(input) ? input : typeof input === 'string' && input !== '' ? [input] : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    let tag = item.trim();
    if (tag === '') continue;
    const canonical = SYNONYMS.get(foldKey(tag));
    if (canonical !== undefined) tag = canonical;
    if (tag.length > MAX_TAG_CHARS) tag = tag.slice(0, MAX_TAG_CHARS);
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_QUESTION) break;
  }
  return out;
}

/**
 * 给生题 prompt 的词表节选：每组取前几个代表标签，控制 prompt 体积。
 * @param {number} perGroup 每组取几个
 */


// ── 读侧扩展：同组双向匹配（V0.24）──────────────────────────────
// 写侧折叠已反转（redis→Redis 具体技术），但存量题库（内置 300 题）的标签仍是
// 抽象归类（缓存架构）。抽样的 topic 交集若只做精确匹配，「Redis 专项」会抽不到
// 内置缓存题。这里用【显式关联表】把具体技术与旧抽象归类的考点族打通，
// 采样交集时双向展开，两边都能命中。
const LEGACY_LINK = Object.freeze({
  'Redis': '缓存架构',
  'MySQL': '数据库索引',
  'Kafka': '消息队列',
});

/** 折叠表按规范值分组的变体集合（模块加载时算一次）。 */
const SYNONYM_GROUPS = (() => {
  const groups = new Map();
  for (const [variant, canonical] of Object.entries(SYNONYM_SOURCE)) {
    const variants = groups.get(canonical) ?? new Set();
    variants.add(variant);
    groups.set(canonical, variants);
  }
  return groups;
})();

/**
 * 把标签集合扩展为「同组双向」的匹配集合（全部小写化）。
 * 例：['Redis'] → 含 redis/缓存架构/缓存穿透/缓存一致性/缓存雪崩 等整个考点族；
 * 无关联的独立标签只含自身（小写）。
 */
export function expandTopics(tags) {
  const out = new Set();
  const absorb = (name) => {
    if (name === undefined || name === null || name === '') return;
    out.add(String(name).toLowerCase());
    const variants = SYNONYM_GROUPS.get(name);
    if (variants !== undefined) for (const variant of variants) out.add(variant);
  };
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw ?? '').trim();
    if (tag === '') continue;
    const lower = tag.toLowerCase();
    absorb(lower);
    const canonical = SYNONYM_SOURCE[lower];
    if (canonical !== undefined) {
      absorb(canonical);
      const legacy = LEGACY_LINK[canonical];
      if (legacy !== undefined) absorb(legacy);
    }
  }
  return out;
}

export function topicDigest(perGroup = 5) {
  return TOPIC_GROUPS
    .map((group) => group.group + '：' + group.topics.slice(0, Math.max(1, perGroup)).join('、'))
    .join('\n');
}
