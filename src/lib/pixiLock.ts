/**
 * What a pixi lock (a plugin's pixi.lock, in its folder) says an environment
 * downloads on a computer: its packages for that platform, and how large
 * they are together, where the lock says - what Meno says before asking to
 * download them. Read as the lock is written (version 6 and on): the
 * environments' packages by platform, each a URL; then every package, its
 * URL and its size.
 */

/** A platform as pixi names it, for an operating system and processor as Tauri names them. */
export function pixiPlatform(os: string, arch: string): string {
  if (os === "macos") return arch === "aarch64" ? "osx-arm64" : "osx-64";
  if (os === "windows") return arch === "aarch64" ? "win-arm64" : "win-64";
  return arch === "aarch64" ? "linux-aarch64" : "linux-64";
}

/** The packages a lock's default environment downloads on `platform`: how many, how many bytes (those whose size it gives), and whether any comes from PyPI. */
export function pixiDownload(lock: string, platform: string): { packages: number; bytes: number; pypi: boolean } {
  const [envs, all = ""] = lock.split(/\npackages:\n/);
  const section = new RegExp(`\\n {6}${platform.replace(/[-]/g, "\\-")}:\\n((?: {6}- .*\\n?)+)`).exec(envs);
  const urls = section ? [...section[1].matchAll(/- (conda|pypi): (\S+)/g)] : [];
  const size = new Map<string, number>();
  for (const block of all.split(/\n(?=- (?:conda|pypi): )/)) {
    const url = /^- (?:conda|pypi): (\S+)/.exec(block)?.[1];
    const bytes = /\n {2}size: (\d+)/.exec(block)?.[1];
    if (url && bytes) size.set(url, Number(bytes));
  }
  return {
    packages: urls.length,
    bytes: urls.reduce((sum, m) => sum + (size.get(m[2]) ?? 0), 0),
    pypi: urls.some((m) => m[1] === "pypi"),
  };
}
