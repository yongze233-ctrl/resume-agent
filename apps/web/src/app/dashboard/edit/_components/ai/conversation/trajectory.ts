import type {
  AgentTrajectory,
  AgentTrajectoryUsage,
  ChatMessage,
  MessageBeat,
} from "../types";

export interface PackedTrajectoryRange {
  /** 该轮在整场活跃时间轴上的起点百分比。 */
  leftPct: number;
  /** 该轮在整场活跃时间轴上占据的宽度百分比。 */
  widthPct: number;
  /** 只包含这一轮执行本身，不包含用户在轮次之间的停留。 */
  durationMs: number;
}

/**
 * 把多轮轨迹拼成一条“活跃执行时间轴”。
 *
 * 持久化时间戳是墙钟时间；直接拿首轮开始到末轮结束做比例，会把用户隔几分钟才发
 * 下一条消息的等待也画进去，真正的模型/工具执行就会被压成几个散点。这里保留每轮
 * 内部的真实时间比例，但移除轮次之间的空闲，只留一个固定的视觉间隔。
 */
export function packTrajectoryRanges(
  trajectories: AgentTrajectory[],
  now = Date.now(),
  requestedGapPct = 1.25,
): { totalActiveMs: number; ranges: PackedTrajectoryRange[] } {
  if (!trajectories.length) return { totalActiveMs: 0, ranges: [] };

  const durations = trajectories.map((trajectory) =>
    Math.max(1, (trajectory.completedAt ?? now) - trajectory.startedAt),
  );
  const totalActiveMs = durations.reduce((total, duration) => total + duration, 0);
  const gapPct =
    trajectories.length > 1
      ? Math.min(Math.max(0, requestedGapPct), 10 / (trajectories.length - 1))
      : 0;
  const usablePct = 100 - gapPct * (trajectories.length - 1);
  let cursorPct = 0;

  const ranges = durations.map((durationMs, index) => {
    const widthPct =
      index === durations.length - 1
        ? Math.max(0, 100 - cursorPct)
        : (usablePct * durationMs) / totalActiveMs;
    const range = { leftPct: cursorPct, widthPct, durationMs };
    cursorPct += widthPct + (index < durations.length - 1 ? gapPct : 0);
    return range;
  });

  return { totalActiveMs, ranges };
}

/** 开始下一次模型请求，同时把上一次没有 usage 尾帧的请求在边界处闭合。 */
export function startTrajectoryStep(
  trajectory: AgentTrajectory,
  input: { id: string; at: number; model?: string },
): AgentTrajectory {
  const steps = trajectory.steps.map((step) =>
    step.status === "running"
      ? { ...step, status: "done" as const, completedAt: input.at }
      : step,
  );
  const existing = steps.find((step) => step.id === input.id);
  if (existing) return { ...trajectory, steps };
  return {
    ...trajectory,
    steps: [
      ...steps,
      {
        id: input.id,
        index: steps.length + 1,
        model: input.model,
        status: "running",
        startedAt: input.at,
      },
    ],
  };
}

/** 首个 reasoning/text token 共用同一枚 TTFT 时间戳，只记第一次。 */
export function markTrajectoryFirstToken(
  trajectory: AgentTrajectory,
  stepId: string | undefined,
  at: number,
): AgentTrajectory {
  if (!stepId) return trajectory;
  let changed = false;
  const steps = trajectory.steps.map((step) => {
    if (step.id !== stepId || step.firstTokenAt !== undefined) return step;
    changed = true;
    return { ...step, firstTokenAt: at };
  });
  return changed ? { ...trajectory, steps } : trajectory;
}

/** llm_usage 同时承担模型请求的结束边界；usage 缺字段时也要闭合。 */
export function completeTrajectoryStep(
  trajectory: AgentTrajectory,
  stepId: string | undefined,
  at: number,
  usage?: AgentTrajectoryUsage,
): AgentTrajectory {
  if (!stepId) return trajectory;
  const steps = trajectory.steps.map((step) =>
    step.id === stepId
      ? { ...step, status: "done" as const, completedAt: at, usage }
      : step,
  );
  return { ...trajectory, steps };
}

/** 流结束时冻结墙钟；没有 end 事件的最后一次模型请求也在这里闭合。 */
export function finishTrajectory(
  trajectory: AgentTrajectory,
  at: number,
): AgentTrajectory {
  return {
    ...trajectory,
    completedAt: at,
    steps: trajectory.steps.map((step) =>
      step.status === "running"
        ? { ...step, status: "done" as const, completedAt: at }
        : step,
    ),
  };
}

/**
 * 正文一旦显示就留在对话中，不能因后续工具调用而撤回。
 * 工具调用仍在运行轨迹中；旧消息保持原来的时间线顺序。
 */
export function splitTrajectoryBeats(message: ChatMessage): {
  trace: MessageBeat[];
  visible: MessageBeat[];
} {
  const beats = message.timeline ?? [];
  if (!message.trajectory?.steps.length) return { trace: [], visible: beats };

  const visible = beats.filter((beat) => beat.kind !== "tool");
  if (!visible.some(beat => beat.kind === 'text') && message.content?.trim()) {
    visible.push({ kind: 'text', id: `${message.id}:content`, text: message.content });
  }
  return {
    trace: beats.filter((beat) => beat.kind === "tool"),
    visible,
  };
}

/** 复制与对话中可见的正文保持一致，工具参数不进入剪贴板。 */
export function visibleAssistantText(message: ChatMessage): string {
  const { visible } = splitTrajectoryBeats(message);
  const text = visible
    .filter((beat): beat is Extract<MessageBeat, { kind: "text" }> =>
      beat.kind === "text",
    )
    .map((beat) => beat.text)
    .join("")
    .trim();
  return text || (message.content ?? "");
}
