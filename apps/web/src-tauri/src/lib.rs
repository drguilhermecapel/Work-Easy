// The desktop app only hosts the web bundle (built with `--mode native`);
// it exposes no custom commands to the page.
pub fn run() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running the WorkEasy desktop app");
}
