import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io

Item {
    id: root
    property var shell: null
    property string cli: "figori"
    readonly property color brandCobalt: "#284BFF"
    readonly property color brandLime: "#DDFC45"
    readonly property color brandInk: "#111827"
    readonly property color brandPaper: "#F7F8FC"
    property string documentId: ""
    property var rateSnapshot: null
    property string rateStatus: "Rates not loaded"
    property string sourceFormat: "numi"
    property int revision: 0
    property int sequence: 0
    property var activeRequest: null
    property var savedDocuments: []
    property string resultText: "Enter an expression or worksheet."
    property string statusText: "Local calculation · no network requests"
    property bool busy: false
    property bool dirty: false
    property var discardAction: null
    property bool pendingEvaluation: false
    property bool streamFinished: false
    property bool processFinished: false
    property bool closingFromHost: false
    property string outputText: ""
    property string errorText: ""

    function settings() {
        return {
            timezone: timezoneField.text,
            anchor: fixedAnchor.checked ? {mode: "fixed", date: anchorField.text} : {mode: "today"},
            billing: includePartial.checked ? "include-partial" : "completed"
        }
    }
    function changed() {
        dirty = true
        revision++
        pendingEvaluation = true
        debounce.restart()
    }
    function evaluate() {
        if (busy) { pendingEvaluation = true; return }
        pendingEvaluation = false
        send("document.evaluate", {source: editor.text, format: sourceFormat, settings: settings(), context: {rates: rateSnapshot || undefined}})
    }
    function send(op, fields) {
        if (busy) { statusText = "Wait for the current operation."; return }
        const payload = fields || {}
        payload.version = 1
        payload.op = op
        payload.id = String(++sequence)
        activeRequest = {payload: payload, revision: revision}
        outputText = ""
        errorText = ""
        streamFinished = false
        processFinished = false
        busy = true
        statusText = op
        process.stdinEnabled = true
        process.command = [cli, "--request"]
        process.running = true
        timeout.restart()
    }
    function finish() {
        if (!busy || !streamFinished || !processFinished) return
        timeout.stop()
        const request = activeRequest
        busy = false
        try {
            const response = JSON.parse(outputText)
            if (response.version !== 1 || response.id !== request.payload.id) throw new Error("Invalid CLI response identity")
            if (!response.ok) throw new Error((response.diagnostics || []).map(function(d) { return d.message }).join("; "))
            const data = response.data
            const op = request.payload.op
            if (op === "document.evaluate") {
                if (request.revision === revision) {
                    resultText = data.lines.map(function(line) {
                        if (!line.evaluation) return line.source
                        const result = line.evaluation
                        const basis = result.basis || {}
                        return line.source + "\n  = " + (result.ok ? result.formatted : result.diagnostics.map(function(d) {return d.message}).join("; "))
                            + (basis.anchorDate ? "\n  Anchor " + basis.anchorDate + " · " + basis.timezone : "")
                            + ((basis.notes || []).length ? "\n  " + basis.notes.join(" ") : "")
                    }).join("\n\n")
                    statusText = "Calculated locally"
                }
            } else if (op === "rates.load" || op === "rates.refresh") {
                rateSnapshot = data.snapshot || null
                rateStatus = "Rates: " + data.status + (data.snapshot ? " · " + data.snapshot.source + " · " + data.snapshot.asOf : "") + (data.error ? " · " + data.error : "")
                pendingEvaluation = true
            } else if (op === "document.list") {
                savedDocuments = data
                statusText = data.length + " saved worksheets"
            } else if (op === "document.load" || op === "document.import") {
                if (request.revision !== revision) {
                    statusText = "Worksheet changed while loading; existing edits preserved. Open again explicitly."
                } else {
                    const doc = data.document
                    documentId = op === "document.import" ? "" : doc.id
                    sourceFormat = doc.format
                    editor.text = doc.source
                    timezoneField.text = doc.settings.timezone
                    fixedAnchor.checked = doc.settings.anchor.mode === "fixed"
                    anchorField.text = doc.settings.anchor.date || ""
                    includePartial.checked = doc.settings.billing === "include-partial"
                    statusText = data.recovered ? "Opened recovery copy" : "Opened worksheet"
                    changed()
                    dirty = false
                }
            } else if (op === "document.save") {
                documentId = data.document.id
                if (request.revision === revision) dirty = false
                statusText = request.revision === revision ? "Saved" : "Saved previous revision; new edits remain unsaved"
            } else if (op === "document.export") {
                statusText = "Exported .numi. " + (data.warnings || []).join(" ")
            }
        } catch (error) {
            statusText = "Error: " + String(error) + (errorText ? " · " + errorText : "")
        }
        activeRequest = null
        if (pendingEvaluation) debounce.restart()
    }
    function open(payloadJson) {
        closingFromHost = false
        try {
            const payload = JSON.parse(payloadJson || "{}")
            if (typeof payload.cli === "string" && payload.cli) cli = payload.cli
            if (typeof payload.source === "string" && !editor.text && !dirty) editor.text = payload.source
        } catch (error) { statusText = "Invalid launch payload; using default CLI." }
        window.visible = true
        Qt.callLater(function() { editor.forceActiveFocus(); if (!busy) send("rates.load", {}) })
    }
    function close() {
        closingFromHost = true
        window.visible = false
        closingFromHost = false
    }
    function confirmDiscard(action) {
        if (!dirty) { action(); return }
        discardAction = action
        discardDialog.open()
    }
    function requestClose() {
        if (shell && typeof shell.hide === "function") shell.hide("befeast.my-numi")
        else window.visible = false
    }
    Timer {
        interval: 60000
        repeat: true
        running: window.visible
        onTriggered: {
            // Refresh only local cache age and one captured document clock.
            // User operations always win; skipped ticks are harmless.
            if (!root.busy) root.send("rates.load", {})
        }
    }
    Timer { id: debounce; interval: 250; onTriggered: root.evaluate() }
    Timer {
        id: timeout
        interval: 30000
        onTriggered: {
            process.running = false
            root.busy = false
            root.activeRequest = null
            root.statusText = "CLI timed out or could not start. Check the configured executable."
        }
    }
    Process {
        id: process
        stdinEnabled: true
        onStarted: write(JSON.stringify(root.activeRequest.payload) + "\n")
        stdout: StdioCollector {
            waitForEnd: true
            onStreamFinished: {
                root.outputText = text
                root.streamFinished = true
                root.finish()
            }
        }
        stderr: StdioCollector {
            waitForEnd: true
            onStreamFinished: root.errorText = text
        }
        onExited: function(exitCode) {
            root.processFinished = true
            root.finish()
        }
    }
    FloatingWindow {
        id: window
        visible: false
        title: "Figori"
        implicitWidth: 1000
        implicitHeight: 720
        onVisibleChanged: {
            if (!visible && !root.closingFromHost) root.requestClose()
        }
        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 16
            spacing: 10
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 64
                radius: 14
                color: root.brandCobalt
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 12
                    Image {
                        source: Qt.resolvedUrl("figori-mark.svg")
                        Layout.preferredWidth: 40
                        Layout.preferredHeight: 40
                        sourceSize.width: 80
                        sourceSize.height: 80
                        fillMode: Image.PreserveAspectFit
                        Accessible.name: "Figori"
                    }
                    Label { text: "Figori"; color: root.brandPaper; font.pixelSize: 24; font.bold: true; Layout.fillWidth: true }
                    Button { text: "Copy results"; onClicked: Quickshell.clipboardText = root.resultText }
                    Button { text: "Close"; onClicked: root.requestClose() }
                }
            }
            RowLayout {
                Label { text: "Timezone" }
                TextField { id: timezoneField; text: "Asia/Jerusalem"; Layout.preferredWidth: 180; onTextEdited: root.changed() }
                CheckBox { id: fixedAnchor; text: "Fixed anchor"; onToggled: root.changed() }
                TextField { id: anchorField; enabled: fixedAnchor.checked; placeholderText: "YYYY-MM-DD"; Layout.preferredWidth: 130; onTextEdited: root.changed() }
                CheckBox { id: includePartial; text: "Include partial billing month"; onToggled: root.changed() }
            }
            SplitView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                ScrollView {
                    SplitView.preferredWidth: 430
                    TextArea {
                        id: editor
                        placeholderText: "13 may 2022 + 9 months\n1 month in days"
                        wrapMode: TextEdit.Wrap
                        font.family: "monospace"
                        selectByMouse: true
                        onTextChanged: root.changed()
                    }
                }
                ScrollView {
                    SplitView.fillWidth: true
                    TextArea { text: root.resultText; readOnly: true; wrapMode: TextEdit.Wrap; selectByMouse: true; font.family: "monospace" }
                }
            }
            RowLayout {
                Button { text: "New"; enabled: !root.busy; onClicked: root.confirmDiscard(function() {root.documentId = ""; root.sourceFormat = "numi"; editor.text = ""; root.dirty = false}) }
                Button { text: "Save"; enabled: !root.busy; onClicked: root.send("document.save", {documentId: root.documentId || undefined, source: editor.text, format: root.sourceFormat, settings: root.settings()}) }
                Button { text: "List saved"; enabled: !root.busy; onClicked: root.send("document.list", {}) }
                ComboBox { id: saved; model: root.savedDocuments; textRole: "title"; Layout.fillWidth: true }
                Button { text: "Open selected"; enabled: !root.busy && saved.currentIndex >= 0; onClicked: root.confirmDiscard(function() {root.send("document.load", {documentId: root.savedDocuments[saved.currentIndex].id})}) }
                Button { text: "Refresh"; enabled: !root.busy; onClicked: root.evaluate() }
            }
            RowLayout {
                TextField { id: filePath; placeholderText: "Absolute .numi / .md path"; Layout.fillWidth: true }
                Button { text: "Import"; enabled: !root.busy && filePath.text.length > 0; onClicked: root.confirmDiscard(function() {root.send("document.import", {path: filePath.text})}) }
                Button { text: "Export new .numi"; enabled: !root.busy && filePath.text.length > 0; onClicked: root.send("document.export", {source: editor.text, format: root.sourceFormat, settings: root.settings(), path: filePath.text, overwrite: false}) }
            }
            RowLayout {
                Label { text: root.rateStatus; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Button { text: "Refresh ILS/USD rates"; enabled: !root.busy; onClicked: root.send("rates.refresh", {}) }
            }
            Label { text: (root.dirty ? "Unsaved · " : "") + root.statusText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
        Dialog {
            id: discardDialog
            title: "Replace unsaved worksheet?"
            modal: true
            anchors.centerIn: parent
            standardButtons: Dialog.Cancel | Dialog.Discard
            Label { text: "Save first to keep your current edits." }
            onDiscarded: { if (root.discardAction) root.discardAction(); root.discardAction = null }
            onRejected: root.discardAction = null
        }
        Shortcut { sequence: "Escape"; onActivated: root.requestClose() }
        Shortcut { sequence: "Ctrl+S"; onActivated: { if (!root.busy) root.send("document.save", {documentId: root.documentId || undefined, source: editor.text, format: root.sourceFormat, settings: root.settings()}) } }
    }
}
