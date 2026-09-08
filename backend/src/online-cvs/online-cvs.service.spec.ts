import { escapeHtml, sanitizePdfHtml } from './online-cvs.service';

describe('online CV PDF HTML safety', () => {
  it('removes executable markup, handlers and remote resource URLs', () => {
    const sanitized = sanitizePdfHtml(
      '<div onclick="alert(1)"><script>fetch("https://evil.test")</script><img src="https://evil.test/a.png"><img src="data:image/png;base64,abc"></div>',
    );

    expect(sanitized).not.toMatch(/script|onclick|https:\/\/evil\.test/i);
    expect(sanitized).toContain('data:image/png;base64,abc');
  });

  it('escapes user-controlled document titles', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });
});
