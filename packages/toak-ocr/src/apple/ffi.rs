use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::Path;

use crate::engine::OcrError;
use crate::region::{BoundingBox, TextRegion};

extern "C" {
    fn vision_ocr_recognize_file(
        path: *const c_char,
        out_data: *mut *mut u8,
        out_len: *mut u64,
        out_error: *mut *mut c_char,
    ) -> i32;

    fn vision_ocr_recognize_bytes(
        data: *const u8,
        len: u64,
        out_data: *mut *mut u8,
        out_len: *mut u64,
        out_error: *mut *mut c_char,
    ) -> i32;

    fn vision_ocr_free_data(ptr: *mut u8, len: u64);
    fn vision_ocr_free_error(ptr: *mut c_char);
}

unsafe fn parse_output(
    data: *mut u8,
    len: u64,
    error: *mut c_char,
    status: i32,
) -> Result<Vec<TextRegion>, OcrError> {
    if status != 0 || !error.is_null() {
        let msg = if !error.is_null() {
            let s = CStr::from_ptr(error).to_string_lossy().into_owned();
            vision_ocr_free_error(error);
            s
        } else {
            "unknown error".into()
        };
        if !data.is_null() {
            vision_ocr_free_data(data, len);
        }
        return Err(OcrError::EngineError(msg));
    }

    if data.is_null() || len == 0 {
        return Ok(Vec::new());
    }

    let slice = std::slice::from_raw_parts(data, len as usize);
    let regions = deserialize_regions(slice);
    vision_ocr_free_data(data, len);
    regions
}

fn deserialize_regions(data: &[u8]) -> Result<Vec<TextRegion>, OcrError> {
    let mut pos = 0;

    let read_u32 = |pos: &mut usize| -> Result<u32, OcrError> {
        if *pos + 4 > data.len() {
            return Err(OcrError::EngineError("truncated data".into()));
        }
        let val = u32::from_le_bytes(data[*pos..*pos + 4].try_into().unwrap());
        *pos += 4;
        Ok(val)
    };

    let read_f32 = |pos: &mut usize| -> Result<f32, OcrError> {
        if *pos + 4 > data.len() {
            return Err(OcrError::EngineError("truncated data".into()));
        }
        let val = f32::from_bits(u32::from_le_bytes(data[*pos..*pos + 4].try_into().unwrap()));
        *pos += 4;
        Ok(val)
    };

    let count = read_u32(&mut pos)? as usize;
    let mut regions = Vec::with_capacity(count);

    for _ in 0..count {
        let text_len = read_u32(&mut pos)? as usize;
        if pos + text_len > data.len() {
            return Err(OcrError::EngineError("truncated text".into()));
        }
        let text = String::from_utf8_lossy(&data[pos..pos + text_len]).into_owned();
        pos += text_len;

        let confidence = read_f32(&mut pos)?;

        if pos >= data.len() {
            return Err(OcrError::EngineError("truncated bbox flag".into()));
        }
        let has_bbox = data[pos];
        pos += 1;

        let bounding_box = if has_bbox != 0 {
            let x = read_f32(&mut pos)?;
            let y = read_f32(&mut pos)?;
            let width = read_f32(&mut pos)?;
            let height = read_f32(&mut pos)?;
            Some(BoundingBox {
                x,
                y,
                width,
                height,
            })
        } else {
            None
        };

        regions.push(TextRegion {
            text,
            bounding_box,
            confidence: Some(confidence),
        });
    }

    Ok(regions)
}

pub fn recognize_file(path: &Path) -> Result<Vec<TextRegion>, OcrError> {
    let path_str = path
        .to_str()
        .ok_or_else(|| OcrError::InvalidInput("non-utf8 path".into()))?;
    let c_path =
        CString::new(path_str).map_err(|_| OcrError::InvalidInput("null byte in path".into()))?;

    let mut data: *mut u8 = std::ptr::null_mut();
    let mut len: u64 = 0;
    let mut error: *mut c_char = std::ptr::null_mut();

    unsafe {
        let status = vision_ocr_recognize_file(c_path.as_ptr(), &mut data, &mut len, &mut error);
        parse_output(data, len, error, status)
    }
}

pub fn recognize_bytes(input: &[u8]) -> Result<Vec<TextRegion>, OcrError> {
    let mut data: *mut u8 = std::ptr::null_mut();
    let mut len: u64 = 0;
    let mut error: *mut c_char = std::ptr::null_mut();

    unsafe {
        let status = vision_ocr_recognize_bytes(
            input.as_ptr(),
            input.len() as u64,
            &mut data,
            &mut len,
            &mut error,
        );
        parse_output(data, len, error, status)
    }
}
