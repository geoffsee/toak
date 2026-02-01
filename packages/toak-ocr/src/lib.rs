pub mod engine;
pub mod region;

#[cfg(target_os = "macos")]
pub mod apple;

pub use engine::{OcrEngine, OcrError, OcrInput, OcrOutput};
pub use region::{BoundingBox, TextRegion};

#[cfg(target_os = "macos")]
pub use apple::AppleOcrEngine;
