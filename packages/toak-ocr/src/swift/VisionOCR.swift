import Foundation
import Vision
import AppKit
import CoreGraphics

// MARK: - PDF rendering

private func renderPDFPages(from url: URL) -> [CGImage]? {
    guard let document = CGPDFDocument(url as CFURL) else { return nil }
    let pageCount = document.numberOfPages
    if pageCount == 0 { return nil }

    var images: [CGImage] = []
    let scale: CGFloat = 2.0 // render at 2x for better OCR accuracy

    for i in 1...pageCount {
        guard let page = document.page(at: i) else { continue }
        let mediaBox = page.getBoxRect(.mediaBox)
        let width = Int(mediaBox.width * scale)
        let height = Int(mediaBox.height * scale)

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { continue }

        ctx.setFillColor(CGColor.white)
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        ctx.scaleBy(x: scale, y: scale)
        ctx.drawPDFPage(page)

        if let cgImage = ctx.makeImage() {
            images.append(cgImage)
        }
    }

    return images.isEmpty ? nil : images
}

private func renderPDFPages(from data: NSData) -> [CGImage]? {
    guard let provider = CGDataProvider(data: data),
          let document = CGPDFDocument(provider) else { return nil }
    let pageCount = document.numberOfPages
    if pageCount == 0 { return nil }

    var images: [CGImage] = []
    let scale: CGFloat = 2.0

    for i in 1...pageCount {
        guard let page = document.page(at: i) else { continue }
        let mediaBox = page.getBoxRect(.mediaBox)
        let width = Int(mediaBox.width * scale)
        let height = Int(mediaBox.height * scale)

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { continue }

        ctx.setFillColor(CGColor.white)
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        ctx.scaleBy(x: scale, y: scale)
        ctx.drawPDFPage(page)

        if let cgImage = ctx.makeImage() {
            images.append(cgImage)
        }
    }

    return images.isEmpty ? nil : images
}

/// Recognize text from multiple images and merge all observations into one result.
private func recognizeImages(_ images: [CGImage]) -> (UnsafeMutablePointer<UInt8>?, Int, UnsafeMutablePointer<CChar>?) {
    var allObservations: [VNRecognizedTextObservation] = []

    for cgImage in images {
        let semaphore = DispatchSemaphore(value: 0)
        var pageObservations: [VNRecognizedTextObservation] = []
        var pageError: Error? = nil

        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                pageError = error
            } else if let results = request.results as? [VNRecognizedTextObservation] {
                pageObservations = results
            }
            semaphore.signal()
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return (nil, 0, strdup(error.localizedDescription))
        }
        semaphore.wait()

        if let error = pageError {
            return (nil, 0, strdup(error.localizedDescription))
        }
        allObservations.append(contentsOf: pageObservations)
    }

    let (ptr, len) = serializeObservations(allObservations)
    return (ptr, len, nil)
}

// MARK: - Serialization

private func serializeObservations(_ observations: [VNRecognizedTextObservation]) -> (UnsafeMutablePointer<UInt8>, Int) {
    var buf = Data()

    let count = UInt32(observations.count)
    withUnsafeBytes(of: count.littleEndian) { buf.append(contentsOf: $0) }

    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let text = candidate.string
        let textBytes = Array(text.utf8)
        let textLen = UInt32(textBytes.count)
        withUnsafeBytes(of: textLen.littleEndian) { buf.append(contentsOf: $0) }
        buf.append(contentsOf: textBytes)

        let confidence = candidate.confidence
        withUnsafeBytes(of: confidence.bitPattern.littleEndian) { buf.append(contentsOf: $0) }

        // has bbox
        buf.append(1)

        let box = observation.boundingBox
        // Flip from bottom-left to top-left origin
        let x = Float(box.origin.x)
        let y = Float(1.0 - box.origin.y - box.height)
        let w = Float(box.width)
        let h = Float(box.height)
        for val in [x, y, w, h] {
            withUnsafeBytes(of: val.bitPattern.littleEndian) { buf.append(contentsOf: $0) }
        }
    }

    let len = buf.count
    let ptr = UnsafeMutablePointer<UInt8>.allocate(capacity: len)
    buf.copyBytes(to: ptr, count: len)
    return (ptr, len)
}

private func recognizeImage(_ cgImage: CGImage) -> (UnsafeMutablePointer<UInt8>?, Int, UnsafeMutablePointer<CChar>?) {
    let semaphore = DispatchSemaphore(value: 0)
    var outData: UnsafeMutablePointer<UInt8>? = nil
    var outLen: Int = 0
    var outError: UnsafeMutablePointer<CChar>? = nil

    let request = VNRecognizeTextRequest { request, error in
        if let error = error {
            outError = strdup(error.localizedDescription)
            semaphore.signal()
            return
        }
        guard let observations = request.results as? [VNRecognizedTextObservation] else {
            outError = strdup("no results")
            semaphore.signal()
            return
        }
        let (ptr, len) = serializeObservations(observations)
        outData = ptr
        outLen = len
        semaphore.signal()
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return (nil, 0, strdup(error.localizedDescription))
    }
    semaphore.wait()
    return (outData, outLen, outError)
}

/// out_data, out_len, out_error are output parameters.
/// Returns 0 on success, 1 on error.
@_cdecl("vision_ocr_recognize_file")
public func recognizeFile(
    _ path: UnsafePointer<CChar>,
    _ out_data: UnsafeMutablePointer<UnsafeMutablePointer<UInt8>?>,
    _ out_len: UnsafeMutablePointer<UInt64>,
    _ out_error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
    let pathStr = String(cString: path)
    let url = URL(fileURLWithPath: pathStr)

    // Try PDF first
    if let pdfImages = renderPDFPages(from: url) {
        let (data, len, error) = recognizeImages(pdfImages)
        out_data.pointee = data
        out_len.pointee = UInt64(len)
        out_error.pointee = error
        return error != nil ? 1 : 0
    }

    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        out_error.pointee = strdup("failed to load image from path: \(pathStr)")
        return 1
    }

    let (data, len, error) = recognizeImage(cgImage)
    out_data.pointee = data
    out_len.pointee = UInt64(len)
    out_error.pointee = error
    return error != nil ? 1 : 0
}

@_cdecl("vision_ocr_recognize_bytes")
public func recognizeBytes(
    _ data: UnsafePointer<UInt8>,
    _ len: UInt64,
    _ out_data: UnsafeMutablePointer<UnsafeMutablePointer<UInt8>?>,
    _ out_len: UnsafeMutablePointer<UInt64>,
    _ out_error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
    let nsData = NSData(bytes: data, length: Int(len))

    // Try PDF first
    if let pdfImages = renderPDFPages(from: nsData) {
        let (d, l, e) = recognizeImages(pdfImages)
        out_data.pointee = d
        out_len.pointee = UInt64(l)
        out_error.pointee = e
        return e != nil ? 1 : 0
    }

    // Try CGImageSource (JPEG, PNG, TIFF, etc.)
    if let imageSource = CGImageSourceCreateWithData(nsData, nil),
       let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) {
        let (d, l, e) = recognizeImage(cgImage)
        out_data.pointee = d
        out_len.pointee = UInt64(l)
        out_error.pointee = e
        return e != nil ? 1 : 0
    }

    // Fallback: NSImage
    if let nsImage = NSImage(data: nsData as Data),
       let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) {
        let (d, l, e) = recognizeImage(cgImage)
        out_data.pointee = d
        out_len.pointee = UInt64(l)
        out_error.pointee = e
        return e != nil ? 1 : 0
    }

    out_error.pointee = strdup("failed to decode image from bytes")
    return 1
}

@_cdecl("vision_ocr_free_data")
public func freeData(_ ptr: UnsafeMutablePointer<UInt8>?, _ len: UInt64) {
    if let ptr = ptr {
        ptr.deallocate()
    }
}

@_cdecl("vision_ocr_free_error")
public func freeError(_ ptr: UnsafeMutablePointer<CChar>?) {
    if let ptr = ptr {
        free(ptr)
    }
}
