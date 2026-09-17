# Figori Linux DEB and RPM previews

Version 0.3.8 supplies Linux x86_64 packages only. AppImage is deferred. The macOS 0.3.6 DMG and Omarchy 0.3.7 user archive remain separate previews.

## Requirements and build baseline

Packages are built using a pinned Ubuntu 22.04 snapshot, Rust 1.96.1 and Bun 1.3.14. The declared runtime baseline is glibc 2.35 or newer, with GTK 3, WebKitGTK 4.1 and libsoup 3. A working graphical session and desktop portal are needed for native interaction and file dialogs. Package managers resolve the distribution-specific declared dependencies.

A DEB/RPM extension is not proof of compatibility with every Debian/Ubuntu/Fedora version. Validation targets are Ubuntu 24.04 (DEB) and Fedora 44 (RPM); consult the release's PACKAGING_STATUS, validation receipts and notes for the actual results. Debian itself has not been verified. Container package-manager and headless X11 smoke checks are not interactive Wayland, clipboard, theme or file-portal acceptance.

## Install

Download the package and SHA256SUMS from the same release and verify the checksum before installation. Save your worksheet and quit Figori before changing the installed application.

On Ubuntu:

```sh
sudo apt install ./Figori-0.3.8-linux-amd64.deb
```

On Fedora:

```sh
sudo dnf install ./Figori-0.3.8-linux-x86_64.rpm
```

The package name and executable are `figori-desktop`; the visible app name is Figori. Launch it from the desktop launcher or run `/usr/bin/figori-desktop`. Do not use force-install options to bypass failed dependencies.

## Switching from the Omarchy user archive

System packages install `/usr/bin/figori-desktop`. An existing user launcher at `~/.local/bin/figori-desktop` or a user `figori-desktop.desktop` entry can override the system package. Save and quit Figori, then review and use the earlier user installation's printed rollback script, or explicitly disable its launcher before switching. Keep your worksheets and recovery data. Packages do not silently remove these user-owned overrides.

## Update and remove

Install the newer package with the same package-manager command. To remove only system package files:

```sh
# Ubuntu
sudo apt remove figori-desktop
# Fedora
sudo dnf remove figori-desktop
```

Package removal does not delete user worksheet, recovery or preference storage. Keep a backup before switching package formats. If rollback is needed, quit Figori and reinstall the previously verified package using your distribution's supported downgrade procedure; do not bypass dependencies.

## Reproducibility and receipts

The manual CI workflow records the source revision, pinned builder, package checksums and validation artifacts. A reproducible recipe is distinct from a demonstrated byte-identical rebuild. Read the exact release receipts rather than assuming every target passed.

Development: https://git.oklabs.uk/BeFeast/figori. Public downloads: https://github.com/BeFeast/figori. Inspired by Numi; support its original developer at https://numi.app.
