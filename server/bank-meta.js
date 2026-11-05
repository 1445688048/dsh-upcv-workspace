/**
 * 内置题库 300 题的级别/题型/进阶要点/考点标注（docs/INTERVIEW-V3-PLAN.md §2.4）。
 *
 * 与 server/mock.js 的题库按 bankId + 题号对位，字段含义：
 *   l  = level  级别标签（junior/mid/senior）
 *   k  = kind   题型标签（concept/mechanism/practice/scenario，由浅入深）
 *   bp = bestPractice 进阶要点在 bank-topics p[] 里的下标（漏掉不算答错的
 *        生产级实践要点，导入时从 essentials 拆出单独存放）
 *   c  = concept 考点一句话（10-24 字；同考点题措辞一致，供考点聚合与去重）
 *
 * 由开发会话批量标注生成（子代理 + 会话内标注对照 mock.js + bank-topics.js 逐题判定），
 * 静态数据不参与运行时生成；题库页可人工修改标注后的题目。
 *
 * @module dsh-upcv-workspace/bank-meta
 */

export const BANK_META = {
  "product-manager": {
    "1": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "自我认知与岗位匹配的结构化表达"
    },
    "2": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "从零到一项目的角色与关键决策复盘"
    },
    "3": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "跨职能分歧的对齐目标与收场方式"
    },
    "4": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "岗位选择动机与职业逻辑的自洽"
    },
    "5": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "失败决策的归因与改进机制沉淀"
    },
    "6": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "多需求并行的优先级评估框架"
    },
    "7": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "MVP 的目的理解与范围划定标准"
    },
    "8": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "AARRR 模型环节含义与适用阶段"
    },
    "9": {
      "l": "mid",
      "k": "practice",
      "bp": [
        1
      ],
      "c": "功能成功的指标定义与归因方式"
    },
    "10": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "北极星指标与 KPI 的本质区别"
    },
    "11": {
      "l": "mid",
      "k": "practice",
      "bp": [
        1
      ],
      "c": "真伪需求的交叉验证与成本判断"
    },
    "12": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "可开发的 PRD 完整度与无歧义性"
    },
    "13": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "用户访谈的开放式提问技巧"
    },
    "14": {
      "l": "mid",
      "k": "practice",
      "bp": [
        1
      ],
      "c": "实验不显著的归因检查与决策"
    },
    "15": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "面向特定人群的功能方案设计"
    },
    "16": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "成熟功能改进点的选择与论证"
    },
    "17": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "特殊用户群体的约束洞察与设计"
    },
    "18": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        0
      ],
      "c": "日活异动的多维度拆解排查"
    },
    "19": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "进入新市场的竞品分析框架"
    },
    "20": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        0
      ],
      "c": "目标场景下的激励机制设计"
    },
    "21": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "免费产品的商业化路径设计"
    },
    "22": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "增长与留存的阶段化取舍论证"
    },
    "23": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "同类产品核心差异的结构化分析"
    },
    "24": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "订阅续费率的漏斗诊断思路"
    },
    "25": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        0
      ],
      "c": "B 端流程配置的抽象与建模"
    },
    "26": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "新社区冷启动的供需两端策略"
    },
    "27": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "产品差异化成因的深度洞察"
    },
    "28": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        0
      ],
      "c": "多端同步功能的状态设计方案"
    },
    "29": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "复杂度反馈的体验优化思路"
    },
    "30": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "面向商家群体的工具方案设计"
    },
    "31": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "数据发现问题的完整推动案例"
    },
    "32": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "向上说服的证据与共识策略"
    },
    "33": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "资源受限下的交付取舍过程"
    },
    "34": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "行业敏感度的持续学习方法"
    },
    "35": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        0
      ],
      "c": "职责外主动担当的具体事例"
    },
    "36": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "跨部门项目的进度风险管理"
    },
    "37": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "用户故事与用例的表达差异"
    },
    "38": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "用户分层的维度与分层策略"
    },
    "39": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "留存曲线的形态解读与健康判断"
    },
    "40": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "调研问卷的设计规范与防偏"
    },
    "41": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "灰度发布与回滚预案的设计"
    },
    "42": {
      "l": "mid",
      "k": "practice",
      "bp": [
        1
      ],
      "c": "活动投入产出比的评估口径"
    },
    "43": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "漏斗分析的原理与业务应用"
    },
    "44": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "竞品定价策略的分析方法"
    },
    "45": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "特定世代用户的核心玩法设计"
    },
    "46": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "企业内部工具的搜索方案设计"
    },
    "47": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "学习场景的激励体系设计"
    },
    "48": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "新留用户的留存提升策略"
    },
    "49": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "社区团购模式的盈利结构分析"
    },
    "50": {
      "l": "senior",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "存量产品重构的推进策略"
    }
  },
  "frontend-engineer": {
    "1": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "自我认知与前端技术方向定位"
    },
    "2": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "高挑战前端项目的难点复盘"
    },
    "3": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "接口分歧的沟通与协作处理"
    },
    "4": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "前端方向选择的动机自洽"
    },
    "5": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "新技术学习的选型与落地方法"
    },
    "6": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "线上前端问题的排查思路"
    },
    "7": {
      "l": "junior",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "事件循环机制的完整执行模型"
    },
    "8": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "宏任务与微任务的调度差异"
    },
    "9": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "闭包成因与内存泄漏风险"
    },
    "10": {
      "l": "junior",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "原型链继承的底层机制"
    },
    "11": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "this 指向规则的系统掌握"
    },
    "12": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "防抖函数实现与适用场景"
    },
    "13": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "节流实现及与防抖的差异"
    },
    "14": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "深拷贝的循环引用与特殊对象处理"
    },
    "15": {
      "l": "junior",
      "k": "mechanism",
      "bp": [
        1
      ],
      "c": "then 链式调用的实现原理"
    },
    "16": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "async/await 的底层实现原理"
    },
    "17": {
      "l": "junior",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "浏览器缓存策略的分层理解"
    },
    "18": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "URL 到渲染的完整链路"
    },
    "19": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "重排重绘区别与减少手段"
    },
    "20": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "同源策略与跨域解决方案"
    },
    "21": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "HTTP/2 相对 1.1 的关键改进"
    },
    "22": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        0
      ],
      "c": "HTTPS 握手的完整过程"
    },
    "23": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "三种浏览器存储的特性差异"
    },
    "24": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "CSP 的作用与 XSS 防御"
    },
    "25": {
      "l": "junior",
      "k": "practice",
      "bp": [
        0
      ],
      "c": "CSRF 的攻击原理与防御手段"
    },
    "26": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "Vue 响应式原理的完整理解"
    },
    "27": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "Proxy 替代 defineProperty 的原因"
    },
    "28": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "虚拟 DOM 与 diff 的工作机制"
    },
    "29": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "Hooks 规则背后的实现原理"
    },
    "30": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        1,
        2
      ],
      "c": "Fiber 架构解决的问题与机制"
    },
    "31": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "状态管理方案的选型思考"
    },
    "32": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        1
      ],
      "c": "前端路由的实现原理对比"
    },
    "33": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "盒模型与 BFC 的规则理解"
    },
    "34": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "Flex 与 Grid 的场景适配"
    },
    "35": {
      "l": "junior",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "圣杯布局的 CSS 实现方案"
    },
    "36": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "移动端 1px 边框的解决方案"
    },
    "37": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "移动端适配方案的对比选型"
    },
    "38": {
      "l": "mid",
      "k": "concept",
      "bp": [
        1
      ],
      "c": "CSS-in-JS 的优劣与适用性"
    },
    "39": {
      "l": "mid",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "前端工程化的整体认知"
    },
    "40": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "Webpack 构建流程与优化手段"
    },
    "41": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "Vite 快速启动的原理"
    },
    "42": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        1,
        2
      ],
      "c": "Tree-shaking 原理与生效条件"
    },
    "43": {
      "l": "senior",
      "k": "practice",
      "bp": [
        3
      ],
      "c": "前端性能优化的体系化方案"
    },
    "44": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "首屏慢的定位与优化路径"
    },
    "45": {
      "l": "senior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "多端组件库的架构设计方案"
    },
    "46": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "微前端的收益与代价权衡"
    },
    "47": {
      "l": "senior",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "前端监控埋点系统的设计"
    },
    "48": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "低代码表单引擎的设计思路"
    },
    "49": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "大文件上传与断点续传实现"
    },
    "50": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "国际化与多主题的切换方案"
    }
  },
  "backend-engineer": {
    "1": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "自我认知与后端技术栈定位"
    },
    "2": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "线上服务的规模与难点复盘"
    },
    "3": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "技术难点的跨职能沟通策略"
    },
    "4": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "后端方向选择的动机自洽"
    },
    "5": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "线上故障的处理过程与复盘"
    },
    "6": {
      "l": "junior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "新技术学习与应用的转化方法"
    },
    "7": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "进程线程协程的本质区别"
    },
    "8": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "IO 多路复用与 select/epoll 差异"
    },
    "9": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "TCP 握手挥手的过程理解"
    },
    "10": {
      "l": "junior",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "TCP 可靠传输的保障机制"
    },
    "11": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "TCP 与 UDP 的区别及选型"
    },
    "12": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "HTTP 与 HTTPS 的核心差异"
    },
    "13": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "HTTP/2 多路复用的原理理解"
    },
    "14": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "零拷贝的原理与性能收益"
    },
    "15": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "进程间通信方式的全面掌握"
    },
    "16": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "死锁的成因与预防手段"
    },
    "17": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "锁机制与乐观悲观锁的差异"
    },
    "18": {
      "l": "mid",
      "k": "concept",
      "bp": [
        1,
        2
      ],
      "c": "CAS 原理与它的典型问题"
    },
    "19": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "线程池核心参数与工作流程"
    },
    "20": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "内存泄漏的成因与排查方法"
    },
    "21": {
      "l": "junior",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "垃圾回收的常见算法对比"
    },
    "22": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "OOM 的成因与定位手段"
    },
    "23": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "B+ 树作为索引结构的原理"
    },
    "24": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "联合索引的最左前缀原则"
    },
    "25": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "慢 SQL 的定位与优化路径"
    },
    "26": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "ACID 与四种隔离级别的理解"
    },
    "27": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        1,
        2
      ],
      "c": "MVCC 的实现机制理解"
    },
    "28": {
      "l": "mid",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "分库分表的策略与权衡"
    },
    "29": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        1
      ],
      "c": "主从复制与读写分离原理"
    },
    "30": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "缓存穿透击穿雪崩的应对"
    },
    "31": {
      "l": "mid",
      "k": "practice",
      "bp": [
        1,
        2
      ],
      "c": "缓存与数据库一致性的保障"
    },
    "32": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "Redis 持久化机制的理解"
    },
    "33": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "Redis 单线程高性能的原理"
    },
    "34": {
      "l": "mid",
      "k": "practice",
      "bp": [
        1,
        2
      ],
      "c": "分布式锁的正确实现要点"
    },
    "35": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "消息不丢失的全链路保障"
    },
    "36": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "消息消费幂等的设计方法"
    },
    "37": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "CAP 理论的取舍实践"
    },
    "38": {
      "l": "mid",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "分布式事务的方案对比"
    },
    "39": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "分布式 ID 生成器的设计"
    },
    "40": {
      "l": "mid",
      "k": "concept",
      "bp": [
        1
      ],
      "c": "熔断降级限流的原理与配合"
    },
    "41": {
      "l": "senior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "秒杀系统的整体架构设计"
    },
    "42": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "短链接服务的设计要点"
    },
    "43": {
      "l": "senior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "高并发评论系统的架构设计"
    },
    "44": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1,
        2
      ],
      "c": "分布式定时调度的设计方案"
    },
    "45": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1
      ],
      "c": "点赞计数系统的架构设计"
    },
    "46": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "即时通讯消息投递的方案设计"
    },
    "47": {
      "l": "senior",
      "k": "scenario",
      "bp": [
        1,
        2
      ],
      "c": "千万级推送系统的架构设计"
    },
    "48": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "微服务拆分的原则与常见坑"
    },
    "49": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1,
        2
      ],
      "c": "灰度发布与回滚机制设计"
    },
    "50": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        1,
        2
      ],
      "c": "接口幂等与重试机制设计"
    }
  },
  "data-analyst": {
    "1": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "自我定位与擅长分析方向的表达"
    },
    "2": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "用数据驱动业务决策的叙事能力"
    },
    "3": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "与业务方数据分歧的沟通处理"
    },
    "4": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "求职动机与岗位价值认同"
    },
    "5": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "数据出错后的复盘与纠错意识"
    },
    "6": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "面向非数据背景的结论表达"
    },
    "7": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "描述统计与推断统计的区别"
    },
    "8": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "中心极限定理的含义与应用"
    },
    "9": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "P 值的定义与常见误读"
    },
    "10": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "两类统计错误的区分与影响"
    },
    "11": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "置信区间的含义与正确解读"
    },
    "12": {
      "l": "mid",
      "k": "practice",
      "bp": [
        1
      ],
      "c": "A/B 实验的整体设计流程"
    },
    "13": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "A/B 实验样本量的计算方法"
    },
    "14": {
      "l": "mid",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "辛普森悖论的成因与规避"
    },
    "15": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "相关与因果的区分及推断方法"
    },
    "16": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "常见分布类型与检验方法选择"
    },
    "17": {
      "l": "junior",
      "k": "practice",
      "bp": [
        0
      ],
      "c": "缺失值的成因与处理策略"
    },
    "18": {
      "l": "junior",
      "k": "practice",
      "bp": [
        0
      ],
      "c": "异常值的识别与处理手段"
    },
    "19": {
      "l": "mid",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "数据倾斜对分析的影响与应对"
    },
    "20": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "数据仓库分层的结构与作用"
    },
    "21": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "维度建模中事实表与维度表"
    },
    "22": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "指标体系的构成与搭建方法"
    },
    "23": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "基础流量指标的口径定义"
    },
    "24": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "留存率的多种口径与选择"
    },
    "25": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "用户转化漏斗的搭建方法"
    },
    "26": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "连续登录问题的 SQL 实现"
    },
    "27": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "窗口函数的原理与常见用途"
    },
    "28": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "left join 与 inner join 的差异"
    },
    "29": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "次日留存率的 SQL 计算"
    },
    "30": {
      "l": "junior",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "分组取最值的 SQL 实现技巧"
    },
    "31": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "笛卡尔积的成因与避免方法"
    },
    "32": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "Excel 常用分析技巧的掌握"
    },
    "33": {
      "l": "junior",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "Python 数据清洗与分析流程"
    },
    "34": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "数据可视化的常见误区"
    },
    "35": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "新功能上线效果评估方案设计"
    },
    "36": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "指标异动的多维度归因思路"
    },
    "37": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "组合指标变动的业务解读"
    },
    "38": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "市场活动效果的衡量与归因"
    },
    "39": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "电商平台核心指标体系设计"
    },
    "40": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "付费转化偏低的诊断框架"
    },
    "41": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "推荐内容质量的量化衡量"
    },
    "42": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "会员用户分层运营方案设计"
    },
    "43": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "渠道投放 ROI 的测算方法"
    },
    "44": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "数据口径分歧的治理与对齐"
    },
    "45": {
      "l": "senior",
      "k": "practice",
      "bp": [],
      "c": "产品改版长期价值的评估方法"
    },
    "46": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "经营分析看板的指标布局"
    },
    "47": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "虚假流量的特征识别方法"
    },
    "48": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "功能存废的数据决策依据"
    },
    "49": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "用户生命周期价值的测算"
    },
    "50": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "流失预警的分析框架搭建"
    }
  },
  "algorithm-engineer": {
    "1": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "研究方向的自我定位表达"
    },
    "2": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "算法项目复现与改进经历"
    },
    "3": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "实验受挫后的思路调整能力"
    },
    "4": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "算法岗求职动机与发展认知"
    },
    "5": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "论文与前沿技术的跟进方法"
    },
    "6": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "与工程团队协作落地经历"
    },
    "7": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "过拟合与欠拟合的判断处理"
    },
    "8": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "偏差与方差的权衡关系"
    },
    "9": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "L1 与 L2 正则化的区别"
    },
    "10": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "交叉验证的作用与常见做法"
    },
    "11": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "分类评估指标的适用场景选择"
    },
    "12": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "ROC 曲线与 AUC 的含义"
    },
    "13": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "类别不平衡的处理策略"
    },
    "14": {
      "l": "junior",
      "k": "concept",
      "bp": [
        2
      ],
      "c": "特征选择的常用方法体系"
    },
    "15": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "逻辑回归与线性回归的区别"
    },
    "16": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "决策树分裂准则的原理"
    },
    "17": {
      "l": "junior",
      "k": "mechanism",
      "bp": [
        2
      ],
      "c": "随机森林比单棵树稳的原因"
    },
    "18": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "GBDT 与 XGBoost 的核心思想"
    },
    "19": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "核函数在 SVM 中的作用"
    },
    "20": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "K-means 的局限与优化方向"
    },
    "21": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "EM 算法原理与收敛性质"
    },
    "22": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "朴素贝叶斯的独立性假设"
    },
    "23": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "梯度下降原理与常见变体"
    },
    "24": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "反向传播的链式求导推导"
    },
    "25": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "激活函数的作用与选型"
    },
    "26": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "BatchNorm 的原理与作用"
    },
    "27": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "Dropout 缓解过拟合的机理"
    },
    "28": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "卷积网络感受野的计算方法"
    },
    "29": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "残差连接解决的退化问题"
    },
    "30": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "RNN 梯度消失的缓解手段"
    },
    "31": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "LSTM 门控机制的工作方式"
    },
    "32": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "注意力机制的核心思想"
    },
    "33": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "Transformer 相对 RNN 的优势"
    },
    "34": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "多头注意力有效的机理"
    },
    "35": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "位置编码的必要性与实现"
    },
    "36": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "预训练微调范式的价值"
    },
    "37": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "BERT 与 GPT 的结构差异"
    },
    "38": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "大模型幻觉的缓解手段"
    },
    "39": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "LoRA 低秩微调降本原理"
    },
    "40": {
      "l": "mid",
      "k": "mechanism",
      "bp": [],
      "c": "量化与蒸馏各自解决的问题"
    },
    "41": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "推荐召回与排序的分层架构"
    },
    "42": {
      "l": "senior",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "短视频推荐系统的整体设计"
    },
    "43": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "推荐冷启动的解决思路"
    },
    "44": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "搜索排序相关性的评估设计"
    },
    "45": {
      "l": "mid",
      "k": "scenario",
      "bp": [
        2
      ],
      "c": "文本分类的端到端落地方案"
    },
    "46": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "广告点击率预估模型设计"
    },
    "47": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "模型线上线下不一致排查"
    },
    "48": {
      "l": "mid",
      "k": "practice",
      "bp": [
        2
      ],
      "c": "对话大模型的效果评估体系"
    },
    "49": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "特征实时更新与在线学习设计"
    },
    "50": {
      "l": "senior",
      "k": "practice",
      "bp": [],
      "c": "模型推理延迟的优化路径"
    }
  },
  "tencent": {
    "1": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "自我介绍与岗位匹配表达"
    },
    "2": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "选择腾讯的动机与排他理由"
    },
    "3": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "腾讯事业群版图的了解深度"
    },
    "4": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "企业价值观的认同与呼应"
    },
    "5": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "用户为本理念的行为印证"
    },
    "6": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "团队分歧下的共识推动"
    },
    "7": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "高压环境的抗压执行经历"
    },
    "8": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "对行业加班现象的态度表达"
    },
    "9": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "中短期职业规划的自洽性"
    },
    "10": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "方案被否定后的心态应对"
    },
    "11": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "腾讯社交护城河的分析"
    },
    "12": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "微信与 QQ 的定位差异"
    },
    "13": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "游戏业务领先优势的归因"
    },
    "14": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "云业务竞争格局与策略建议"
    },
    "15": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "微信新功能的产品创意设计"
    },
    "16": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "用户时长竞争的攻防分析"
    },
    "17": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "产业互联网战略挑战分析"
    },
    "18": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "会议产品的差异化竞争点"
    },
    "19": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "视频号商业化路径设计"
    },
    "20": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "广告业务与字节的差距分析"
    },
    "21": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "新赛道选择的战略取舍"
    },
    "22": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "提升支付频次的产品方案"
    },
    "23": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "政策风险下的业务应对"
    },
    "24": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "To B 业务短板的判断"
    },
    "25": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "企业协同办公的产品设计"
    },
    "26": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "科技向善理念的理解表达"
    },
    "27": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "产品体验的敏感度与洞察"
    },
    "28": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "新功能上线价值的衡量指标"
    },
    "29": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "重大线上故障的应急处理"
    },
    "30": {
      "l": "mid",
      "k": "scenario",
      "bp": [],
      "c": "商业化与体验的平衡之道"
    },
    "31": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "进程与线程的区别辨析"
    },
    "32": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "TCP 三次握手的目的"
    },
    "33": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "哈希表与红黑树的场景选择"
    },
    "34": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "快速排序复杂度与优化点"
    },
    "35": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "动态规划思想与例题应用"
    },
    "36": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "虚拟内存的机制与作用"
    },
    "37": {
      "l": "junior",
      "k": "mechanism",
      "bp": [],
      "c": "数据库索引加速查询原理"
    },
    "38": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "缓存与数据库一致性保障"
    },
    "39": {
      "l": "mid",
      "k": "concept",
      "bp": [],
      "c": "CAP 理论的取舍理解"
    },
    "40": {
      "l": "mid",
      "k": "practice",
      "bp": [],
      "c": "接口幂等的含义与实现"
    },
    "41": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "前端首屏加载优化手段"
    },
    "42": {
      "l": "junior",
      "k": "concept",
      "bp": [],
      "c": "Python GIL 的影响认知"
    },
    "43": {
      "l": "junior",
      "k": "practice",
      "bp": [],
      "c": "机器学习过拟合的治理"
    },
    "44": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "高并发抽奖系统的设计"
    },
    "45": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "春节红包发放方案设计"
    },
    "46": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "亿级排行榜的架构设计"
    },
    "47": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "直播弹幕系统的架构设计"
    },
    "48": {
      "l": "senior",
      "k": "scenario",
      "bp": [],
      "c": "跨端消息同步方案设计"
    },
    "49": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "自我能力亮点的临场定位"
    },
    "50": {
      "l": "junior",
      "k": "scenario",
      "bp": [],
      "c": "面试失利后的成长心态"
    }
  }
};
