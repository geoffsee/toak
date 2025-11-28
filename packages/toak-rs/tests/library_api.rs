//! Integration tests for the toak-rs library API

#[test]
fn test_prelude_imports() {
    // This test verifies that the prelude module exports everything correctly
    use toak_rs::prelude::*;

    // Test that functions are available
    let cleaned = clean_code("let x = 5; // comment");
    assert!(!cleaned.contains("//"));

    let redacted = redact_secrets("api_key = 'sk-abc123def456'");
    assert!(redacted.contains("[REDACTED]"));

    // clean_and_redact removes lines with secrets entirely
    let combined = clean_and_redact("let x = 5;\napi_secret = 'secret123';\nlet y = 10; // comment");
    assert!(!combined.contains("secret123"));
    assert!(!combined.contains("api_secret"));
    assert!(!combined.contains("//"));
    assert!(combined.contains("let x = 5"));

    let tokens = count_tokens("hello world");
    assert!(tokens > 0);
}

#[test]
fn test_direct_imports() {
    // This test verifies that you can import specific functions directly
    use toak_rs::clean_and_redact;

    // Lines with secrets are removed entirely by clean_and_redact
    let code = "let x = 1;\nsecret_key = 'secret123'; // internal use\nlet y = 2;";
    let result = clean_and_redact(code);

    // The secret line should be completely removed
    assert!(!result.contains("secret123"));
    assert!(!result.contains("secret_key"));
    assert!(!result.contains("//"));
    // But other lines should remain
    assert!(result.contains("let x = 1"));
}

#[test]
fn test_token_cleaner_module() {
    // This test verifies the token_cleaner module is publicly accessible
    use toak_rs::token_cleaner;

    let code = "import { Something } from 'package';";
    let cleaned = token_cleaner::clean_code(code);
    assert!(!cleaned.contains("import"));
}

#[test]
fn test_text_chunker_module() {
    // This test verifies the text_chunker module is publicly accessible
    use toak_rs::text_chunker::{chunk_text, ChunkerConfig};

    let text = "This is a test. This is another sentence. And another one.";
    let config = ChunkerConfig::default();
    let chunks = chunk_text(text, &config);

    assert!(!chunks.is_empty());
    for chunk in chunks {
        assert!(!chunk.content.is_empty());
    }
}

#[test]
fn test_embeddings_generator_init() {
    // This test verifies the embeddings generator is available (but won't actually generate)
    // because model download can be slow in tests
    use toak_rs::EmbeddingsGenerator;

    // Just verify the type is accessible - actual embedding generation requires downloading model
    let _generator = EmbeddingsGenerator::new();
    // In a real test, you'd do: assert!(generator.is_ok());
}

#[test]
fn test_markdown_generator_types() {
    // This test verifies the markdown generator types are publicly accessible
    use toak_rs::{MarkdownGenerator, MarkdownGeneratorOptions};
    use std::path::PathBuf;

    let options = MarkdownGeneratorOptions {
        dir: PathBuf::from("."),
        output_file_path: PathBuf::from("test.md"),
        file_type_exclusions: Default::default(),
        file_exclusions: Default::default(),
        verbose: false,
    };

    let _generator = MarkdownGenerator::new(options);
    // Verify the type constructs without error
}

#[test]
fn test_json_database_generator_types() {
    // This test verifies the database generator types are publicly accessible
    use toak_rs::JsonDatabaseOptions;
    use std::path::PathBuf;

    let options = JsonDatabaseOptions {
        dir: PathBuf::from("."),
        output_file_path: PathBuf::from("embeddings.json"),
        file_type_exclusions: Default::default(),
        file_exclusions: Default::default(),
        verbose: false,
        chunker_config: Default::default(),
        max_concurrent_files: 4,
        embedding_pool_size: JsonDatabaseOptions::default().embedding_pool_size,
        embedding_batch_size: None,
    };

    // Verify options construct without error
    let _options = options;
}