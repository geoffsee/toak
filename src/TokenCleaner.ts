export class TokenCleaner {
  patterns: { regex: RegExp; replacement: string }[];
  secretPatterns: { regex: RegExp; replacement: string }[];

  constructor(customPatterns: { regex: RegExp; replacement: string }[] = [], customSecretPatterns: {
    regex: RegExp;
    replacement: string
  }[] = []) {
    this.patterns = [
      { regex: /\/\/.*$/gm, replacement: '' },
      { regex: /\/\*[\s\S]*?\*\//gm, replacement: '' },
      { regex: /console\.(log|error|warn|info)\(.*?\);?/g, replacement: '' },
      { regex: /^\s*[\r\n]/gm, replacement: '' },
      { regex: / +$/gm, replacement: '' },
      { regex: /^\s*import\s+.*?;?\s*$/gm, replacement: '' },
      { regex: /^\s*\n+/gm, replacement: '\n' },
      ...customPatterns,
    ];
    // eslint-no-no-useless-escape
    this.secretPatterns = [
      {
        regex:
          /(?<=(['"])(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret[_-]?key|private[_-]?key)['"]:\s*['"])[^'"]+(?=['"])/gi,
        replacement: '[REDACTED]',
      },
      {
        regex:
          /(?<=(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret[_-]?key|private[_-]?key)\s*=\s*['"])[^'"]+(?=['"])/gi,
        replacement: '[REDACTED]',
      },
      { regex: /(?<=bearer\s+)[a-zA-Z0-9\-._~+\/]+=*/gi, replacement: '[REDACTED]' },
      {
        regex: /(?<=Authorization:\s*Bearer\s+)[a-zA-Z0-9\-._~+\/]+=*/gi,
        replacement: '[REDACTED]',
      },
      {
        regex: /(?<=eyJ)[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+\/=]*/g,
        replacement: '[REDACTED_JWT]',
      },
      { regex: /([a-f0-9]{40}|[a-f0-9]{64})/gi, replacement: '[REDACTED_HASH]' },
      {
        regex: /(?<=[^A-Za-z0-9]|^)([A-Za-z0-9+\/]{40}|[A-Za-z0-9+\/]{64})(?=[^A-Za-z0-9]|$)/g,
        replacement: '[REDACTED_BASE64]',
      },
      ...customSecretPatterns,
    ];
  }

  clean(code: string): string {
    return this.patterns.reduce(
      (cleanCode, pattern) => cleanCode.replace(pattern.regex, pattern.replacement),
      code,
    );
  }

  redactSecrets(code: string): string {
    return this.secretPatterns.reduce(
      (redactedCode, pattern) => redactedCode.replace(pattern.regex, pattern.replacement),
      code,
    );
  }

  cleanAndRedact(code: string): string {
    const cleanedCode = this.clean(code);
    return this.redactSecrets(cleanedCode);
  }
}