#[derive(Debug, Clone, PartialEq)]
pub struct BoundingBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone)]
pub struct TextRegion {
    pub text: String,
    pub bounding_box: Option<BoundingBox>,
    pub confidence: Option<f32>,
}
