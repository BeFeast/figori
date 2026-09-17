fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::env::var("OUT_DIR").unwrap();
        let target = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
        let arch = if target == "aarch64" {
            "arm64"
        } else {
            "x86_64"
        };
        let status = std::process::Command::new("xcrun")
            .args([
                "swiftc",
                "-parse-as-library",
                "-emit-library",
                "-static",
                "-target",
                &format!("{arch}-apple-macosx12.0"),
                "chrome.swift",
                "-o",
                &format!("{out}/libfigori_chrome.a"),
            ])
            .status()
            .expect("Xcode Swift compiler is required for native macOS chrome");
        assert!(status.success(), "Native AppKit chrome compilation failed");
        println!("cargo:rustc-link-search=native={out}");
        println!("cargo:rustc-link-lib=static=figori_chrome");
        let compiler = std::process::Command::new("xcrun")
            .args(["--find", "swiftc"])
            .output()
            .expect("Locate Swift toolchain");
        let compiler = String::from_utf8(compiler.stdout).unwrap();
        let toolchain = std::path::Path::new(compiler.trim())
            .parent()
            .unwrap()
            .parent()
            .unwrap();
        println!(
            "cargo:rustc-link-search=native={}/lib/swift/macosx",
            toolchain.display()
        );
        println!("cargo:rustc-link-search=native=/usr/lib/swift");
        println!("cargo:rustc-link-lib=dylib=swiftCore");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        println!("cargo:rerun-if-changed=chrome.swift");
    }
    tauri_build::build()
}
