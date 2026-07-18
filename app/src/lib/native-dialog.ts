// Specifier must be a variable: vite statically resolves literal dynamic
// imports even with @vite-ignore, breaking builds when the optional plugin
// isn't installed.
const DIALOG_MODULE = "@tauri-apps/plugin-dialog";

export async function dialogAvailable(): Promise<boolean> {
  try {
    await import(/* @vite-ignore */ DIALOG_MODULE);
    return true;
  } catch {
    return false;
  }
}

export async function pickFolder(): Promise<string | null> {
  try {
    const { open } = await import(/* @vite-ignore */ DIALOG_MODULE);
    const result = await open({ directory: true });
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}
