export class TokenCleaner {
  patterns: { regex: RegExp; replacement: string }[];
  secretPatterns: { regex: RegExp; replacement: string }[];

  constructor(customPatterns: { regex: RegExp; replacement: string }[] = [], customSecretPatterns: {
    regex: RegExp;
    replacement: string
  }[] = []) {
    this.patterns = [
      { regex: /\/\/.*$/gm, replacement: '' }, // Single-line comments
      { regex: /\/\*[\s\S]*?\*\//g, replacement: '' }, // Multi-line comments
      { regex: /console\.(log|error|warn|info)\(.*?\);?/g, replacement: '' }, // Console statements
      { regex: /^\s*[\r\n]/gm, replacement: '' }, // Empty lines
      { regex: / +$/gm, replacement: '' }, // Trailing spaces
      { regex: /^\s*import\s+.*?;?\s*$/gm, replacement: '' }, // Import statements
      { regex: /^\s*\n+/gm, replacement: '\n' }, // Multiple newlines
      ...customPatterns,
    ];
    // eslint-no-no-useless-escape

      (this.secretPatterns = [
        // JSON/object style: "key": "value" with sensitive key names; only redact if value length >= 3
        {
          regex: /(?<=(["'])(?:api[_-]?key|stripe[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret|secret[_-]?key|private[_-]?key|jwt[_-]?secret)["']\s*:\s*["'])([^"']{3,})(?=["'])/gi,
          replacement: '[REDACTED]',
        },
        // JWT anywhere inside quotes
        {
          regex: /(?<=['"])(eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+\/=]*)(?=['"])/g,
          replacement: '[REDACTED_JWT]',
        },
        // Assignment with quotes: key = "value"; redact if value length >= 3
        {
          regex: /(api[_-]?key|stripe[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret|secret[_-]?key|private[_-]?key|jwt[_-]?secret)\s*=\s*(["'])([^"']{3,})\2/gi,
          replacement: '$1 = $2[REDACTED]$2',
        },
        // .env style: KEY=VALUE (optionally quoted). Replace entire value, normalize to KEY=[REDACTED] without quotes/spaces
        {
          regex: /(^\s*(?:export\s+)?)(API[_-]?KEY|API[_-]?SECRET|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|DB[_-]?PASSWORD|DATABASE[_-]?PASSWORD|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|GOOGLE_API_KEY|AZURE_CLIENT_SECRET|DATABASE_URL|MONGO_URI|MYSQL_URL|JWT[_-]?SECRET|SECRET[_-]?KEY|PRIVATE[_-]?KEY)\s*=\s*(?:\"[^\"]{3,}\"|'[^']{3,}'|[^\s#\n]{3,})/gm,
          replacement: '$1$2=[REDACTED]',
        },
        // Bearer tokens
        {
          regex: /(?<=bearer\s+)[a-zA-Z0-9\-._~+\/]+=*/gi,
          replacement: '[REDACTED]'
        },
        {
          regex: /(?<=Authorization:\s*Bearer\s+)[a-zA-Z0-9\-._~+\/]+=*/gi,
          replacement: '[REDACTED]',
        },
        // Hex hashes (SHA1/SHA256)
        {
          regex: /\b([a-f0-9]{40}|[a-f0-9]{64})\b/gi,
          replacement: '[REDACTED_HASH]',
        },
        // Base64-like strings inside quotes (length >= 40 with optional padding)
        {
          regex: /(['"])([A-Za-z0-9+\/]{40,}={0,2})\1/g,
          replacement: '$1[REDACTED_BASE64]$1',
        },
        // YAML/TOML key: value forms; replace full value token with "[REDACTED]"
        {
          regex: /(?<=\b(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret|secret[_-]?key|private[_-]?key|jwt[_-]?secret)\s*:\s*)(?:\"[^\"]{3,}\"|'[^']{3,}'|[^\s#\n]{3,})/gm,
          replacement: '"[REDACTED]"',
        },
        ...customSecretPatterns,
      ]);
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
    // First redact secrets
    const redactedCode = this.redactSecrets(code);

    // Add pattern to remove lines that only contain redacted content
    const redactedLines = /^.*\[REDACTED(?:_[A-Z]+)?\].*$/gm;
    const withoutRedactedLines = redactedCode.replace(redactedLines, '');

    // Then clean the code
    const cleanedCode = this.clean(withoutRedactedLines);

    return cleanedCode.trim();
  }
}
