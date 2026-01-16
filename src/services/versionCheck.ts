import { CURRENT_APP_VERSION } from "../version";

/**
 * Compares two semantic version strings.
 * Returns:
 *  1 if v1 > v2
 * -1 if v1 < v2
 *  0 if v1 === v2
 */
export const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const val1 = parts1[i] || 0;
    const val2 = parts2[i] || 0;
    if (val1 > val2) return 1;
    if (val1 < val2) return -1;
  }
  return 0;
};

export const checkVersion = async (): Promise<{ hasUpdate: boolean, remoteVersion: string }> => {
  try {
    // Cache busting is crucial here
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch version.json");
    
    const data = await res.json();
    const remoteVersion = data.version;

    console.log(`[Update_System] Local: ${CURRENT_APP_VERSION} | Remote: ${remoteVersion}`);

    if (compareVersions(remoteVersion, CURRENT_APP_VERSION) > 0) {
        return { hasUpdate: true, remoteVersion };
    }
  } catch (e: any) {
    console.error("[Update_System] Check failed:", e.message);
  }
  return { hasUpdate: false, remoteVersion: CURRENT_APP_VERSION };
};
