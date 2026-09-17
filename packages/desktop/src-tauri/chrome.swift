import AppKit

typealias Callback = @convention(c) (UnsafePointer<CChar>) -> Void
private var chrome: Chrome?
private func send(_ event: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: event), let json = String(data: data, encoding: .utf8) else { return }
    json.withCString { chrome?.callback($0) }
}
final class Chrome: NSObject, NSToolbarDelegate, NSWindowDelegate {
    let window: NSWindow
    let callback: Callback
    var preferences: [String: Any] = [:]
    var settings: NSWindow?
    let font = NSPopUpButton()
    let theme = NSPopUpButton()
    let size = NSSlider(value: 16, minValue: 12, maxValue: 24, target: nil, action: nil)
    let spacing = NSSlider(value: 1.9, minValue: 1.4, maxValue: 2.2, target: nil, action: nil)
    let sizeLabel = NSTextField(labelWithString: "16 pt")
    let spacingLabel = NSTextField(labelWithString: "1.9×")
    init(window: NSWindow, callback: @escaping Callback) {
        self.window = window; self.callback = callback
        super.init()
        let toolbar = NSToolbar(identifier: "Figori.Worksheet")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        window.toolbar = toolbar
        window.toolbarStyle = .unified
        window.titleVisibility = .visible
    }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { toolbarDefaultItemIdentifiers(toolbar) }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        ["new", "open", "save", NSToolbarItem.Identifier.flexibleSpace.rawValue, "context", "appearance"].map { NSToolbarItem.Identifier($0) }
    }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier id: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let names = ["new": ("New Worksheet", "square.and.pencil"), "open": ("Open Worksheet", "folder"), "save": ("Save Worksheet", "square.and.arrow.down"), "context": ("Calculation Context", "calendar"), "appearance": ("Settings", "gearshape")]
        guard let info = names[id.rawValue] else { return nil }
        let item = NSToolbarItem(itemIdentifier: id)
        item.label = info.0; item.paletteLabel = info.0; item.toolTip = info.0
        item.image = NSImage(systemSymbolName: info.1, accessibilityDescription: info.0)
        item.target = self; item.action = #selector(toolbarAction(_:))
        return item
    }
    @objc func toolbarAction(_ item: NSToolbarItem) {
        if item.itemIdentifier.rawValue == "appearance" { showSettings() }
        else { send(["type": "menu", "value": item.itemIdentifier.rawValue]) }
    }
    func configure(_ prefs: [String: Any]) {
        preferences = prefs
        let mode = prefs["theme"] as? String ?? "system"
        let appearance: NSAppearance? = mode == "dark" ? NSAppearance(named: .darkAqua) : mode == "light" ? NSAppearance(named: .aqua) : nil
        window.appearance = appearance; settings?.appearance = appearance
        font.selectItem(at: (prefs["font"] as? String == "system") ? 1 : 0)
        theme.selectItem(at: ["system", "light", "dark"].firstIndex(of: mode) ?? 0)
        size.doubleValue = prefs["size"] as? Double ?? 16
        spacing.doubleValue = prefs["spacing"] as? Double ?? 1.9
        updateLabels()
    }
    func updateLabels() {
        sizeLabel.stringValue = "\(Int(size.doubleValue.rounded())) pt"
        spacingLabel.stringValue = String(format: "%.1f×", spacing.doubleValue)
    }
    func showSettings() {
        if let settings { settings.makeKeyAndOrderFront(nil); return }
        let panel = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 260), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        panel.title = "Settings"; panel.isReleasedWhenClosed = false
        let content = NSStackView()
        content.orientation = .vertical; content.alignment = .leading; content.spacing = 20
        content.edgeInsets = NSEdgeInsets(top: 28, left: 28, bottom: 28, right: 28)
        font.addItems(withTitles: ["JetBrains Mono Nerd Font", "System Monospaced"])
        theme.addItems(withTitles: ["Follow System", "Light", "Dark"])
        for control in [font, theme, size, spacing] as [NSControl] { control.target = self; control.action = #selector(changed(_:)) }
        size.isContinuous = true; spacing.isContinuous = true
        size.numberOfTickMarks = 13; size.allowsTickMarkValuesOnly = true
        spacing.numberOfTickMarks = 9; spacing.allowsTickMarkValuesOnly = true
        for (label, control, value) in [("Font", font as NSView, nil), ("Text Size", size as NSView, sizeLabel), ("Line Spacing", spacing as NSView, spacingLabel), ("Appearance", theme as NSView, nil)] {
            let title = NSTextField(labelWithString: label)
            title.widthAnchor.constraint(equalToConstant: 92).isActive = true
            let row = NSStackView(views: [title, control] + (value.map { [$0] } ?? []))
            row.orientation = .horizontal; row.spacing = 12; row.alignment = .centerY
            control.widthAnchor.constraint(equalToConstant: 225).isActive = true
            content.addArrangedSubview(row)
        }
        panel.contentView = content; panel.center(); settings = panel
        configure(preferences)
        panel.makeKeyAndOrderFront(nil)
    }
    @objc func changed(_ sender: NSControl) {
        configure(["font": font.indexOfSelectedItem == 0 ? "nerd" : "system", "size": size.doubleValue.rounded(), "spacing": (spacing.doubleValue * 10).rounded() / 10, "theme": ["system", "light", "dark"][max(0, theme.indexOfSelectedItem)]])
        send(["type": "appearance", "value": preferences])
    }
}
@_cdecl("figori_chrome_configure")
public func configureChrome(_ pointer: UnsafeMutableRawPointer, _ json: UnsafePointer<CChar>, _ callback: @escaping @convention(c) (UnsafePointer<CChar>) -> Void) {
    let window = Unmanaged<NSWindow>.fromOpaque(pointer).takeUnretainedValue()
    if chrome == nil { chrome = Chrome(window: window, callback: callback) }
    if let data = String(cString: json).data(using: .utf8), let prefs = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { chrome?.configure(prefs) }
}
@_cdecl("figori_chrome_settings")
public func showChromeSettings() { chrome?.showSettings() }
