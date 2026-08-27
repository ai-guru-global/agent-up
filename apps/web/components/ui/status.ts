/**
 * 全站状态与术语字典。
 *
 * 建立此文件前，STATUS_COLOR / STATUS_BADGE / SEVERITY_COLOR 在 agents、
 * feedback、releases、skills 四个页面各自重复定义，同一语义的色阶还不一致
 * （DRAFT 在 agents 页是 amber-600、在 skills 页是 amber-400）。
 * 这里统一为单一出处，并为每个枚举补上中文名与「它意味着什么」的解释，
 * 供 Badge 的 title 提示与页面图例复用。
 */

export type Tone = "neutral" | "info" | "success" | "warn" | "danger" | "accent";

export interface StatusMeta {
  /** 中文标签，界面主显示 */
  label: string;
  /** 语义色调，映射到 globals.css 的语义 token */
  tone: Tone;
  /** 这个状态意味着什么 —— 用于 title 提示与图例，避免用户猜枚举含义 */
  desc: string;
}

type Dict = Record<string, StatusMeta>;

/** Agent 生命周期 */
export const AGENT_STATUS: Dict = {
  DRAFT: {
    label: "草稿",
    tone: "warn",
    desc: "配置尚未发布，仅自己可见，不会对外提供服务",
  },
  ACTIVE: {
    label: "已上线",
    tone: "success",
    desc: "已通过发布审批，正在对外提供服务",
  },
  ARCHIVED: {
    label: "已归档",
    tone: "neutral",
    desc: "已停止服务，配置与历史版本保留可查",
  },
};

/** 反馈处理流转状态 */
export const FEEDBACK_STATUS: Dict = {
  NEW: { label: "待分诊", tone: "info", desc: "刚录入，还没有人判断归属与优先级" },
  TRIAGED: { label: "已分诊", tone: "warn", desc: "已判定严重程度与目标分区，等待指派处理人" },
  ASSIGNED: { label: "已指派", tone: "accent", desc: "已指派处理人，尚未开始改动配置" },
  IN_PROGRESS: { label: "处理中", tone: "warn", desc: "正在修改对应分区的配置或语料" },
  RESOLVED: { label: "已解决", tone: "success", desc: "改动已完成，等待提出方或审批人验证效果" },
  VERIFIED: { label: "已验证", tone: "success", desc: "验证通过，确认问题不再复现" },
  CLOSED: { label: "已关闭", tone: "neutral", desc: "流程终结，不再跟踪" },
  WONTFIX: { label: "不予处理", tone: "danger", desc: "确认为预期行为或超出能力边界，不做改动" },
};

/** 反馈严重程度 */
export const SEVERITY: Dict = {
  CRITICAL: { label: "严重", tone: "danger", desc: "回答明显错误或阻断业务，需要立即处理" },
  MAJOR: { label: "重要", tone: "warn", desc: "影响可用性但有替代路径，应尽快处理" },
  MINOR: { label: "次要", tone: "neutral", desc: "体验或表述问题，可排期处理" },
  SUGGESTION: { label: "建议", tone: "neutral", desc: "优化想法，不是缺陷" },
};

/** 反馈评价倾向 */
export const RATING: Dict = {
  POSITIVE: { label: "正面", tone: "success", desc: "本次回答被认为有帮助" },
  NEGATIVE: { label: "负面", tone: "danger", desc: "本次回答未解决问题，是复盘与语料加强的主要来源" },
  NEUTRAL: { label: "中性", tone: "neutral", desc: "没有明确的好评或差评倾向" },
};

/** 发布审批状态 */
export const RELEASE_STATUS: Dict = {
  PENDING: { label: "待审批", tone: "warn", desc: "变更已提交，等待审批人查看 diff 并裁决" },
  APPROVED: { label: "已通过", tone: "success", desc: "审批通过并已生成不可变的版本快照" },
  REJECTED: { label: "已拒绝", tone: "danger", desc: "变更被驳回，配置保持发布前的状态" },
  CHANGES_REQUESTED: { label: "要求修改", tone: "warn", desc: "审批人要求调整后重新提交，变更未生效" },
};

/** Skill 生命周期 */
export const SKILL_STATUS: Dict = {
  DRAFT: { label: "草稿", tone: "warn", desc: "还在编写，不会出现在 Agent 的可绑定列表中" },
  PUBLISHED: { label: "已发布", tone: "success", desc: "可被任意 Agent 绑定使用" },
  DEPRECATED: { label: "已弃用", tone: "neutral", desc: "不建议新绑定，已绑定的仍可运行" },
  ARCHIVED: { label: "已归档", tone: "neutral", desc: "停止维护，仅作历史留档" },
};

/**
 * 四分区 —— 既是 Agent 的配置模型，也是反馈归因的分类学。
 * label 保持与既有 PARTITION_LABELS 一致，额外补 role（一句话隐喻）与 desc。
 */
export const PARTITION: Record<string, StatusMeta & { role: string }> = {
  PROMPT: {
    label: "Prompt",
    role: "性格与纪律",
    tone: "accent",
    desc: "系统提示词、角色设定与硬性约束，决定 Agent 怎么说话、什么不能做",
  },
  KNOWLEDGE: {
    label: "知识",
    role: "长期记忆",
    tone: "info",
    desc: "绑定的知识库与检索策略，决定 Agent 能查到什么料",
  },
  TOOLS: {
    label: "工具",
    role: "手",
    tone: "success",
    desc: "可调用的 MCP 工具与 Skill，决定 Agent 能做什么动作",
  },
  ROUTING: {
    label: "路由",
    role: "分诊台",
    tone: "warn",
    desc: "工单分类规则与转人工阈值，决定什么该自己答、什么该转人",
  },
};

/** 知识库页元数据的含义 —— 这些字段此前在界面上没有任何解释 */
export const WIKI_META_HELP: Record<string, string> = {
  provenance: "来源：这页知识是人工撰写、从工单蒸馏，还是由外部语料库导入",
  lifecycle: "生命周期：草稿 / 生效中 / 待复核 / 已过期，决定是否参与检索",
  tier: "层级：核心结论、支撑细节还是参考附录，影响检索时的优先级",
  confidence: "置信度：0—1，蒸馏时的自评可信度，低于阈值的内容不会直接作为答案依据",
};

/**
 * 知识页生命周期 —— 与 WIKI_META_HELP.lifecycle 描述的同一个概念，
 * 这里给出后端实际使用的五个枚举值及各自的判定标准。
 */
export const WIKI_LIFECYCLE: Dict = {
  DRAFT: {
    label: "草稿",
    tone: "warn",
    desc: "刚写完或刚导入，还没有人复核过，检索时优先级最低",
  },
  REVIEWED: {
    label: "已复核",
    tone: "info",
    desc: "有人读过并确认表述通顺，但事实准确性尚未逐条验证",
  },
  VERIFIED: {
    label: "已验证",
    tone: "success",
    desc: "内容已被核实为准确，可以放心作为回答依据引用",
  },
  DISPUTED: {
    label: "存疑",
    tone: "danger",
    desc: "有反馈指出这页内容与事实冲突，修订完成前不应作为答案依据",
  },
  ARCHIVED: {
    label: "已归档",
    tone: "neutral",
    desc: "已失效或被更新的内容取代，保留供追溯，不再参与检索",
  },
};

/** 知识页层级 —— 决定同一次检索命中多页时谁排在前面 */
export const WIKI_TIER: Dict = {
  CORE: {
    label: "核心",
    tone: "accent",
    desc: "直接给出结论的关键知识，检索时优先返回",
  },
  SUPPORTING: {
    label: "支撑",
    tone: "info",
    desc: "补充细节、步骤与前置条件，用来支持核心结论",
  },
  PERIPHERAL: {
    label: "参考",
    tone: "neutral",
    desc: "背景资料或附录，只在核心与支撑都没命中时才被用到",
  },
};

/**
 * 反馈标签的含义。标签本身是自由文本，这里只给常用的几个配上解释；
 * 未登记的标签仍然原样显示，只是没有额外释义。
 */
export const FEEDBACK_TAG_HELP: Record<string, string> = {
  ANSWER_QUALITY: "回答质量：答案本身的准确度、完整度或表达方式不理想",
  KNOWLEDGE_GAP: "知识缺口：知识库里没有这段料，属于「知识」分区需要补充",
  OUTDATED_INFO: "信息过期：知识库里有这段料，但已经不再符合现状，需要更新或归档",
  TOOL_ERROR: "工具报错：Agent 调用外部工具失败或返回了预期外的结果",
  ROUTING_ERROR: "路由错误：这类问题被分发给了不合适的处理路径",
};

/** 取反馈标签的悬浮解释，未登记的标签给一句通用说明 */
export function tagHelp(tag: string): string {
  return FEEDBACK_TAG_HELP[tag] ?? `标签「${tag}」：人工打的分类标记，用于把同类问题聚在一起看`;
}

/** 取状态元信息，未登记的枚举值也能安全降级显示 */
export function metaOf(dict: Dict, code: string | null | undefined): StatusMeta {
  if (!code) return { label: "未设置", tone: "neutral", desc: "该字段尚未填写" };
  return dict[code] ?? { label: code, tone: "neutral", desc: "未登记的状态值" };
}
