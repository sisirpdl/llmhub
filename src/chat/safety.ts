/**
 * Local, conservative safeguards for the categories a chat app must not
 * facilitate. They are deliberately not presented as a substitute for model
 * evaluation: every model, especially user-added GGUFs, can still fail.
 */
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ');

const childSexual =
  /\b(?:child|children|minor|underage|teen)\b[^.\n]{0,90}\b(?:sex|sexual|nude|naked|explicit|groom)/i;
const selfHarm =
  /\b(?:kill|hurt|harm|cut)\s+(?:myself|yourself|himself|herself|themselves)\b|\bsuicide\b/i;
const violentWrongdoing =
  /\b(?:kill|murder|shoot|stab|poison|bomb)\b[^.\n]{0,90}\b(?:how|plan|make|build|without getting caught|instructions?)/i;
const illegalInstructions =
  /\b(?:make|build|buy|sell|hide|evade|bypass|break into)\b[^.\n]{0,100}\b(?:bomb|explosive|malware|ransomware|phishing|credit card fraud|meth|cocaine|weapon)/i;
const nonConsensualSexual = /\b(?:rape|sexual assault|non-consensual)\b/i;

export const SAFETY_SYSTEM_INSTRUCTION = `Safety rules: do not provide content that sexually exploits or endangers children; facilitates self-harm, violence, illegal wrongdoing, or non-consensual sexual activity; or helps someone evade law enforcement. Refuse briefly and do not provide alternatives, steps, code, quantities, or tactics. For imminent self-harm or danger, encourage contacting local emergency services or a crisis line and a trusted person. Offer only safe, high-level alternatives.`;

export function unsafePromptMessage(value: string): string | null {
  const text = normalize(value);
  if (childSexual.test(text) || nonConsensualSexual.test(text))
    return 'I can’t help with sexual exploitation or non-consensual sexual content.';
  if (selfHarm.test(text))
    return 'I can’t help with self-harm. If you may be in immediate danger, call local emergency services now. Consider contacting a crisis line or someone you trust who can stay with you.';
  if (violentWrongdoing.test(text) || illegalInstructions.test(text))
    return 'I can’t help plan or carry out violence or illegal wrongdoing.';
  return null;
}

/** Never show a completed response that contains an obvious restricted pattern. */
export function safeResponse(value: string): string {
  if (
    childSexual.test(value) ||
    nonConsensualSexual.test(value) ||
    violentWrongdoing.test(value) ||
    illegalInstructions.test(value) ||
    selfHarm.test(value)
  )
    return 'This response was withheld because it may contain unsafe or prohibited content. You can report it for review.';
  return value;
}
