use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "macos" {
        return;
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let swift_src = PathBuf::from("src/swift/VisionOCR.swift");

    println!("cargo:rerun-if-changed={}", swift_src.display());

    let object_file = out_dir.join("VisionOCR.o");
    let status = Command::new("swiftc")
        .args([
            "-emit-object",
            "-O",
            "-target",
            &format!(
                "{}-apple-macosx13.0",
                env::var("CARGO_CFG_TARGET_ARCH").unwrap()
            ),
            "-o",
        ])
        .arg(&object_file)
        .arg(&swift_src)
        .status()
        .expect("failed to run swiftc");
    assert!(status.success(), "swiftc failed");

    let lib_file = out_dir.join("libvision_ocr.a");
    let status = Command::new("ar")
        .args(["rcs"])
        .arg(&lib_file)
        .arg(&object_file)
        .status()
        .expect("failed to run ar");
    assert!(status.success(), "ar failed");

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=vision_ocr");

    // Link required frameworks
    for framework in ["Vision", "Foundation", "CoreGraphics", "AppKit"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }

    // Link Swift runtime
    let swift_lib_dir = String::from_utf8(
        Command::new("xcrun")
            .args(["--show-sdk-path"])
            .output()
            .expect("failed to run xcrun")
            .stdout,
    )
    .unwrap();
    let swift_lib_dir = swift_lib_dir.trim();

    // Swift toolchain lib dir
    let toolchain_lib = String::from_utf8(
        Command::new("xcrun")
            .args(["--toolchain", "default", "--find", "swift"])
            .output()
            .expect("failed to find swift")
            .stdout,
    )
    .unwrap();
    let toolchain_lib = PathBuf::from(toolchain_lib.trim())
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("lib/swift/macosx");

    println!(
        "cargo:rustc-link-search=native={}/usr/lib/swift",
        swift_lib_dir
    );
    println!(
        "cargo:rustc-link-search=native={}",
        toolchain_lib.display()
    );
    println!("cargo:rustc-link-lib=dylib=swiftCore");
}
