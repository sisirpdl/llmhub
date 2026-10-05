/** Credentials belong only on requests whose initial URL is the HTTPS Hub origin. */
export function hfAuthHeaders(
  url: string,
  token = '',
): { Authorization: string } | undefined {
  const value = token.trim();
  return value && /^https:\/\/huggingface\.co(?::443)?(?:\/|$)/i.test(url)
    ? { Authorization: `Bearer ${value}` }
    : undefined;
}
export function downloadHttpError(status: number): string {
  return status === 401 || status === 403
    ? 'Access denied. Enter a Hugging Face read token in Settings and ensure your account has access to this model.'
    : `Download failed with HTTP ${status}.`;
}
