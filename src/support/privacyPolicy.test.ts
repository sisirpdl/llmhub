import fs from 'fs';
import path from 'path';
import { privacyPolicy } from './privacyPolicy';

test('hosted Markdown and HTML privacy disclosures match every in-app section', () => {
  const markdown = fs.readFileSync(
    path.join(__dirname, '../../docs/privacy-policy.md'),
    'utf8',
  );
  const html = fs.readFileSync(
    path.join(__dirname, '../../docs/privacy-policy.html'),
    'utf8',
  );
  for (const { title, text } of privacyPolicy) {
    expect(markdown).toContain(`## ${title}\n\n${text}`);
    const escape = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    expect(html).toContain(`<h2>${escape(title)}</h2><p>${escape(text)}</p>`);
  }
});
