import { imageUrls, type ChatMessage } from './chatDocument';
/** Select context without serializing it into a second prompt format. */
export function prepareMessages(
  messages: ChatMessage[],
  contextLength: number,
  outputTokens: number,
  vision: boolean,
) {
  const instructions = messages.filter(
    m => m.role === 'system' || m.role === 'developer',
  );
  const turns = messages.filter(
    m => m.role !== 'system' && m.role !== 'developer',
  );
  // Keep tool calls/results in the same user-turn group. Exact token budgeting is a separate roadmap item.
  const groups: ChatMessage[][] = [];
  for (const m of turns) {
    if (m.role === 'user' || !groups.length) groups.push([]);
    groups[groups.length - 1].push(m);
  }
  const budget = Math.max(512, (contextLength - outputTokens) * 4);
  let size = JSON.stringify(instructions).length;
  const retained: ChatMessage[][] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const weight = JSON.stringify(groups[i], (key, value) =>
      key === 'url' && typeof value === 'string' && value.startsWith('data:')
        ? '[media]'
        : value,
    ).length;
    if (size + weight > budget && retained.length) break;
    retained.unshift(groups[i]);
    size += weight;
  }
  const retainedTurns = new Set(retained.flat());
  const selected = messages.filter(
    m => m.role === 'system' || m.role === 'developer' || retainedTurns.has(m),
  );
  const pendingCalls = new Set<string>();
  for (const m of selected) {
    if (m.role === 'tool') {
      if (!m.tool_call_id || !pendingCalls.delete(m.tool_call_id))
        throw new Error(
          'This chat has a tool result without its matching call. Its history is preserved for export.',
        );
    } else if (pendingCalls.size)
      throw new Error(
        'This chat has unresolved tool calls. Hub preserves them but does not execute tools.',
      );
    m.tool_calls?.forEach(call => pendingCalls.add(call.id));
    if (
      vision &&
      imageUrls(m).some(
        url => !url.startsWith('file://') && !url.startsWith('data:image/'),
      )
    )
      throw new Error(
        'This chat references external images. They are preserved, but Hub will not fetch them automatically.',
      );
    if (
      Array.isArray(m.content) &&
      m.content.some(part => !['text', 'image_url'].includes(part.type))
    )
      throw new Error(
        'This chat contains media parts that the current inference engine does not support. They remain available for export.',
      );
  }
  if (pendingCalls.size)
    throw new Error(
      'This chat has unresolved tool calls. Hub preserves them but does not execute tools.',
    );
  return {
    messages: vision
      ? selected
      : selected.map(m =>
          Array.isArray(m.content)
            ? { ...m, content: m.content.filter(p => p.type !== 'image_url') }
            : m,
        ),
    omittedMessageCount: turns.length - retained.flat().length,
    oversized: size > budget,
  };
}
