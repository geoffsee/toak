use toak_rs::prelude::*;

#[test]
fn test_semantic_search_with_embeddings_file() {
    // This test requires the embeddings.json file to exist
    let embeddings_path = "embeddings.json";

    // Skip test if embeddings file doesn't exist
    if !std::path::Path::new(embeddings_path).exists() {
        println!("Skipping test: embeddings.json not found");
        return;
    }

    let mut search = SemanticSearch::new(embeddings_path)
        .expect("Failed to load embeddings database");

    // Get metadata
    let metadata = search.metadata();
    println!("Loaded embeddings database:");
    println!("  Model: {}", metadata.model);
    println!("  Total chunks: {}", metadata.total_chunks);
    println!("  Chunk size: {}", metadata.chunk_size);

    // Perform a search
    let results = search.search("gitignore configuration", 3)
        .expect("Failed to perform search");

    assert!(!results.is_empty(), "Expected to find at least one result");

    println!("\nSearch results for 'gitignore configuration':");
    for (i, result) in results.iter().enumerate() {
        println!("{}. {} (similarity: {:.4})", i + 1, result.file_path, result.similarity);
        println!("   Content: {}", result.content.lines().next().unwrap_or(""));
    }

    // Verify results are sorted by similarity (descending)
    for i in 1..results.len() {
        assert!(
            results[i - 1].similarity >= results[i].similarity,
            "Results should be sorted by similarity in descending order"
        );
    }
}

#[test]
fn test_semantic_search_different_queries() {
    let embeddings_path = "embeddings.json";

    if !std::path::Path::new(embeddings_path).exists() {
        println!("Skipping test: embeddings.json not found");
        return;
    }

    let mut search = SemanticSearch::new(embeddings_path)
        .expect("Failed to load embeddings database");

    let queries = vec![
        "rust code",
        "configuration files",
        "documentation",
    ];

    for query in queries {
        let results = search.search(query, 2)
            .expect("Failed to perform search");

        println!("\nTop 2 results for '{}':", query);
        for result in &results {
            println!("  - {} (similarity: {:.4})", result.file_path, result.similarity);
        }

        assert!(results.len() <= 2, "Should return at most 2 results");
    }
}

#[test]
fn test_chunk_count() {
    let embeddings_path = "embeddings.json";

    if !std::path::Path::new(embeddings_path).exists() {
        println!("Skipping test: embeddings.json not found");
        return;
    }

    let search = SemanticSearch::new(embeddings_path)
        .expect("Failed to load embeddings database");

    let count = search.chunk_count();
    let metadata = search.metadata();

    assert_eq!(count, metadata.total_chunks, "Chunk count should match metadata");
    println!("Database contains {} chunks", count);
}