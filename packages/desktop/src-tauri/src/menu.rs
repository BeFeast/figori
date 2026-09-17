use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let about = PredefinedMenuItem::about(app, Some("About Figori"), None)?;
    // Native terminate: can bypass the frontend dirty-close guard on macOS.
    let quit = MenuItem::with_id(app, "quit", "Quit Figori", true, Some("CmdOrCtrl+Q"))?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let application = Submenu::with_items(app, "Figori", true, &[&about, &settings, &quit])?;
    let new = MenuItem::with_id(app, "new", "New Worksheet", true, Some("CmdOrCtrl+N"))?;
    let open = MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let save = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_as = MenuItem::with_id(app, "save-as", "Save As…", true, Some("CmdOrCtrl+Shift+S"))?;
    let export_source = MenuItem::with_id(
        app,
        "export-markdown",
        "Export Markdown Source…",
        true,
        None::<&str>,
    )?;
    let export_results = MenuItem::with_id(
        app,
        "export-markdown-results",
        "Export Markdown with Results…",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new,
            &open,
            &save,
            &save_as,
            &separator,
            &export_source,
            &export_results,
        ],
    )?;
    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&undo, &redo, &cut, &copy, &paste, &select_all],
    )?;
    app.set_menu(Menu::with_items(app, &[&application, &file, &edit])?)?;
    Ok(())
}
