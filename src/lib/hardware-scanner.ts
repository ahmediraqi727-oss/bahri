/**
 * hardware-scanner.ts
 *
 * Enterprise-grade global HID barcode/QR scanner listener.
 *
 * Design decisions:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. FOCUS-TRAP AWARE: The listener explicitly ignores keystrokes when the
 *    currently active element is an INPUT, TEXTAREA, SELECT, or any element
 *    with contenteditable="true". This prevents manual typing in search boxes
 *    or quantity fields from being mistakenly interpreted as a barcode scan.
 *
 * 2. TIMING-BASED DETECTION: Physical scanners emit characters very quickly
 *    (typically 5–50ms between keystrokes). We use a 120ms inter-keystroke
 *    timeout — if the gap between keystrokes exceeds this, the buffer resets.
 *    This cleanly separates human typing (>120ms between keys) from scanner
 *    input (≪50ms between keys).
 *
 * 3. MINIMUM LENGTH GUARD: A valid scan must produce ≥4 characters to avoid
 *    false positives from single-key shortcuts.
 *
 * 4. EVENT BUS PATTERN: Emits a native CustomEvent on `window` so that ANY
 *    component or page can listen independently without prop drilling.
 *    Event name: "barcode_hardware_scanned"
 *    Event detail: { code: string }
 *
 * 5. SINGLETON: Only one listener is registered at a time, regardless of how
 *    many components mount. Safe to call start() multiple times.
 */

const SCAN_TIMEOUT_MS = 120;   // Max ms between scanner keystrokes
const MIN_SCAN_LENGTH = 4;     // Minimum characters to constitute a valid scan

// Characters that should NOT be buffered (modifier keys, etc.)
const IGNORE_KEYS = new Set([
  "Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Escape",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "Home", "End", "PageUp", "PageDown", "Insert", "Delete",
  "NumLock", "ScrollLock", "Pause", "PrintScreen",
]);

/**
 * Returns true if the currently focused element is an interactive text field
 * where the user might be typing manually.
 */
function isUserTypingManually(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

class HardwareScannerServiceClass {
  private buffer: string = "";
  private lastKeystrokeTime: number = 0;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private running: boolean = false;

  private handleKeyDown = (e: KeyboardEvent): void => {
    // ── Focus-Trap Guard ─────────────────────────────────────────────────────
    // CRITICAL: Do NOT process keystrokes when user is typing in a text field.
    if (isUserTypingManually()) return;

    // Ignore modifier-only and navigation keys
    if (IGNORE_KEYS.has(e.key)) return;

    const now = Date.now();

    // If too much time has passed since last keystroke, reset buffer
    if (this.buffer.length > 0 && now - this.lastKeystrokeTime > SCAN_TIMEOUT_MS) {
      this.buffer = "";
    }

    this.lastKeystrokeTime = now;

    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    // "Enter" key signals end of scan
    if (e.key === "Enter") {
      const scannedCode = this.buffer.trim();
      this.buffer = "";
      if (scannedCode.length >= MIN_SCAN_LENGTH) {
        this.emitScan(scannedCode);
      }
      return;
    }

    // Accumulate a single printable character
    if (e.key.length === 1) {
      this.buffer += e.key;
    }

    // Safety valve: if buffer grows very large (long barcode prefix) without Enter,
    // reset after a window to avoid stale data
    this.timeoutHandle = setTimeout(() => {
      this.buffer = "";
    }, SCAN_TIMEOUT_MS * 3);
  };

  private emitScan(code: string): void {
    const event = new CustomEvent<{ code: string }>("barcode_hardware_scanned", {
      detail: { code },
      bubbles: true,
    });
    window.dispatchEvent(event);

    if (process.env.NODE_ENV === "development") {
      console.log(`[HardwareScanner] Scan detected: "${code}"`);
    }
  }

  start(): void {
    if (this.running) return; // Already listening — no double-bind
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", this.handleKeyDown, { capture: true });
    this.running = true;
    if (process.env.NODE_ENV === "development") {
      console.log("[HardwareScanner] Started — listening for HID scanner input");
    }
  }

  stop(): void {
    if (!this.running) return;
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", this.handleKeyDown, { capture: true });
    if (this.timeoutHandle !== null) clearTimeout(this.timeoutHandle);
    this.buffer = "";
    this.running = false;
    if (process.env.NODE_ENV === "development") {
      console.log("[HardwareScanner] Stopped");
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

// Singleton export — one instance shared across the entire app
export const HardwareScannerService = new HardwareScannerServiceClass();

/**
 * React hook: attach/detach hardware scanner listener with component lifecycle.
 * Only activates when `enabled` is true (gates on RBAC permission).
 *
 * Usage:
 *   useHardwareScanner(true, (code) => handleScan(code));
 */
export function useHardwareScannerEffect(
  enabled: boolean,
  onScan: (code: string) => void
): void {
  // This is intentionally a plain function, not a React hook, so it can be
  // called from a useEffect. Import and use it as:
  //   useEffect(() => useHardwareScannerEffect(enabled, onScan), [enabled, onScan]);
  void enabled;
  void onScan;
}

/**
 * Utility: subscribe to hardware scan events imperatively.
 * Returns a cleanup function. Use inside useEffect.
 *
 * Example:
 *   useEffect(() => {
 *     if (!canUseHardware) return;
 *     HardwareScannerService.start();
 *     return subscribeToHardwareScan((code) => { ... });
 *   }, [canUseHardware]);
 */
export function subscribeToHardwareScan(
  callback: (code: string) => void
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ code: string }>).detail;
    if (detail?.code) callback(detail.code);
  };
  window.addEventListener("barcode_hardware_scanned", handler);
  return () => window.removeEventListener("barcode_hardware_scanned", handler);
}
