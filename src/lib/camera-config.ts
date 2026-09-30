/**
 * camera-config.ts
 *
 * Camera Resolution & Frame Rate Configuration Engine
 * Designed for device stability, battery efficiency, and low-end mobile optimization.
 */

export type CameraResolutionKey = "480p" | "720p" | "1080p";
export type CameraFpsKey = 15 | 24 | 30 | 60;

export interface CameraResolutionOption {
  key: CameraResolutionKey;
  label: string;
  sublabel: string;
  width: number;
  height: number;
  badge?: string;
  isLightweight?: boolean;
}

export interface CameraFpsOption {
  fps: CameraFpsKey;
  label: string;
  sublabel: string;
  badge?: string;
  isLightweight?: boolean;
}

export const CAMERA_RESOLUTIONS: Record<CameraResolutionKey, CameraResolutionOption> = {
  "480p": {
    key: "480p",
    label: "480p (SD)",
    sublabel: "640 × 480",
    width: 640,
    height: 480,
    badge: "للأجهزة الضعيفة ⚡",
    isLightweight: true,
  },
  "720p": {
    key: "720p",
    label: "720p (HD)",
    sublabel: "1280 × 720",
    width: 1280,
    height: 720,
    badge: "متوازن (افتراضي)",
  },
  "1080p": {
    key: "1080p",
    label: "1080p (FHD)",
    sublabel: "1920 × 1080",
    width: 1920,
    height: 1080,
    badge: "فائق الدقة للملصقات الصغيرة 🔍",
  },
};

export const CAMERA_FPS_OPTIONS: Record<CameraFpsKey, CameraFpsOption> = {
  15: {
    fps: 15,
    label: "15 إطار/ثانية",
    sublabel: "يمنع السخونة والتهنيج",
    badge: "اقتصادي للأجهزة الضعيفة ❄️",
    isLightweight: true,
  },
  24: {
    fps: 24,
    label: "24 إطار/ثانية",
    sublabel: "متوازن وموفر للطاقة",
  },
  30: {
    fps: 30,
    label: "30 إطار/ثانية",
    sublabel: "سلس ومعياري",
    badge: "الافتراضي",
  },
  60: {
    fps: 60,
    label: "60 إطار/ثانية",
    sublabel: "أقصى سلاسة للأجهزة القوية",
  },
};

export interface CameraSettingsState {
  resolution: CameraResolutionKey;
  fps: CameraFpsKey;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettingsState = {
  resolution: "720p",
  fps: 30,
};

export function loadSavedCameraSettings(): CameraSettingsState {
  if (typeof window === "undefined") return DEFAULT_CAMERA_SETTINGS;
  try {
    const raw = localStorage.getItem("ahmed_bahri_camera_settings");
    if (!raw) return DEFAULT_CAMERA_SETTINGS;
    const parsed = JSON.parse(raw);
    const validRes: CameraResolutionKey = parsed.resolution in CAMERA_RESOLUTIONS ? parsed.resolution : "720p";
    const validFps: CameraFpsKey = parsed.fps in CAMERA_FPS_OPTIONS ? (parsed.fps as CameraFpsKey) : 30;
    return { resolution: validRes, fps: validFps };
  } catch {
    return DEFAULT_CAMERA_SETTINGS;
  }
}

export function saveCameraSettings(settings: CameraSettingsState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("ahmed_bahri_camera_settings", JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
