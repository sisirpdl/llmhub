import { messageText } from '../chat/chatDocument';
import type { Message } from '../chat/useChatController';
import { emptyIssueDraft } from './issueReport';

/** Include only the selected text, never the rest of the chat or image bytes. */
export function responseReportDraft(message: Message) {
  const text = messageText(message);
  const suffix = '\n[Response truncated to fit the report.]';
  return {
    ...emptyIssueDraft(),
    title: 'Offensive or unsafe AI response',
    description:
      text.length > 4000 ? text.slice(0, 4000 - suffix.length) + suffix : text,
    steps: `Model: ${(message.modelName || message.modelId || 'Unknown').slice(
      0,
      500,
    )}\nDescribe why this response is offensive or unsafe:`,
  };
}
