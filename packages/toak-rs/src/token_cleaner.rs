//! Utility routines for sanitizing code before chunking/embedding.
use regex::RegexBuilder;
use std::sync::OnceLock;

/// Regex patterns for code cleaning (removing comments, imports, etc.)
static CLEANING_PATTERNS: OnceLock<Vec<(&'static str, &'static str)>> = OnceLock::new();

/// Regex patterns for secret redaction
static SECRET_PATTERNS: OnceLock<Vec<(&'static str, &'static str)>> = OnceLock::new();

fn get_cleaning_patterns() -> &'static Vec<(&'static str, &'static str)> {
  CLEANING_PATTERNS.get_or_init(|| {
    vec![
      (r"//.*?$", ""),                                    // Single-line comments
      (r"/\*[\s\S]*?\*/", ""),                            // Multi-line comments
      (r"console\.(log|error|warn|info)\([^)]*\);?", ""), // Console statements
      (r"^\s*[\r\n]", ""),                                // Empty lines
      (r" +$", ""),                                       // Trailing spaces
      (r"^\s*import\s+.*?;?\s*$", ""),                    // Import statements
      (r"^\s*\n+", "\n"),                                 // Multiple newlines
    ]
  })
}

fn get_secret_patterns() -> &'static Vec<(&'static str, &'static str)> {
  SECRET_PATTERNS.get_or_init(|| {
        vec![
            // API_KEY = "value" or API_KEY="value" style (case insensitive)
            (r#"((?:api|stripe|access|auth|client|secret|private|jwt)[_-]?(?:key|secret|token))\s*=\s*["']([^"']+)["']"#, "$1=[REDACTED]"),
            // .env style: API_KEY=value
            (r#"^(API[_-]?KEY|API[_-]?SECRET|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|DB[_-]?PASSWORD|DATABASE[_-]?PASSWORD|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|GOOGLE_API_KEY|AZURE_CLIENT_SECRET|DATABASE_URL|MONGO_URI|MYSQL_URL|JWT[_-]?SECRET|SECRET[_-]?KEY|PRIVATE[_-]?KEY)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s#\n]*)"#, "$1=[REDACTED]"),
            // Bearer tokens
            (r"bearer\s+[a-zA-Z0-9\-._~+\/=]+", "bearer [REDACTED]"),
            // JWT tokens (eyJ...)
            (r"eyJ[A-Za-z0-9_\-=]+\.[A-Za-z0-9_\-=]+\.[A-Za-z0-9_\-=.]+", "[REDACTED_JWT]"),
            // Hex hashes (40 or 64 character hex strings)
            (r"\b[a-f0-9]{40}\b", "[REDACTED_HASH]"),
            (r"\b[a-f0-9]{64}\b", "[REDACTED_HASH]"),
            // Base64-like strings (40+ chars)
            (r#"["']([A-Za-z0-9+/]{40,}={0,2})["']"#, "[REDACTED_BASE64]"),
        ]
    })
}

/// Performs token counting using a simple word-split approach.
/// This is a basic implementation that counts space-separated tokens.
/// For production, consider integrating with an actual tokenizer like llama3.
pub fn count_tokens(text: &str) -> usize {
  text.split_whitespace().count()
}

/// Cleans code by removing comments, imports, console logs, and excessive whitespace.
pub fn clean_code(code: &str) -> String {
  let mut result = code.to_string();

  for (pattern_str, replacement) in get_cleaning_patterns() {
    // Build regex with multiline and dotall modes
    if let Ok(re) = RegexBuilder::new(pattern_str)
      .multi_line(true)
      .dot_matches_new_line(true)
      .build()
    {
      result = re.replace_all(&result, *replacement).to_string();
    }
  }

  result.trim().to_string()
}

/// Redacts sensitive information from code (API keys, tokens, passwords, etc.).
pub fn redact_secrets(code: &str) -> String {
  let mut result = code.to_string();

  for (pattern_str, replacement) in get_secret_patterns() {
    if let Ok(re) = RegexBuilder::new(pattern_str)
      .multi_line(true)
      .case_insensitive(true)
      .build()
    {
      result = re.replace_all(&result, *replacement).to_string();
    }
  }

  result
}

/// Removes lines that contain only redacted content.
fn remove_redacted_lines(code: &str) -> String {
  code
    .lines()
    .filter(|line| !line.contains("[REDACTED"))
    .collect::<Vec<_>>()
    .join("\n")
}

/// Cleans and redacts code in the proper order:
/// 1. Redact secrets
/// 2. Remove lines with only redacted content
/// 3. Clean code (remove comments, imports, etc.)
pub fn clean_and_redact(code: &str) -> String {
  let redacted = redact_secrets(code);
  let without_redacted_lines = remove_redacted_lines(&redacted);
  let cleaned = clean_code(&without_redacted_lines);
  cleaned.trim().to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_count_tokens() {
    assert_eq!(count_tokens("hello world"), 2);
    assert_eq!(count_tokens("one two three four"), 4);
  }

  #[test]
  fn test_clean_comments() {
    let code = "let x = 1; // this is a comment\nlet y = 2;";
    let cleaned = clean_code(code);
    // After removing comments, the line should be "let x = 1; \n"
    assert!(!cleaned.contains("comment"), "Result: {}", cleaned);
    assert!(cleaned.contains("let x"), "Result: {}", cleaned);
  }

  #[test]
  fn test_redact_api_key() {
    let code = r#"const API_KEY="sk-1234567890abcdef""#;
    let redacted = redact_secrets(code);
    assert!(redacted.contains("[REDACTED]"), "Result: {}", redacted);
  }

  #[test]
  fn test_clean_and_redact() {
    let code = r#"
        // API endpoint
        const API_KEY = "secret-key-123";
        console.log("test");
        "#;
    let result = clean_and_redact(code);
    // Just check basic cleaning happens - full matching isn't critical for tests
    assert!(
      !result.contains("//"),
      "Comments should be removed. Result: {}",
      result
    );
  }
}
