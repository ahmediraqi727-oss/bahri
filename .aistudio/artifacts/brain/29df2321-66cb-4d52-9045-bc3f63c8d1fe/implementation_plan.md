# Mobile-First Barcode & QR Scanner Refactoring & Camera Engine

Comprehensive architectural and UX refactoring for the Barcode & QR Scanner modal to resolve layout breakdown on mobile screens and ensure resilient camera access across all mobile devices (iOS Safari, Android Chrome, and secure WebViews).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during Phase 1 clarification:
> - **Mobile Toolbar Layout**: Compact icon toolbar with a collapsible settings drawer (`شريط أيقونات مدمج مع زر منسدل للإعدادات الإضافية`) to eliminate text clipping and vertical letter wrapping on small viewports.
> - **Mobile Camera Quality**: Automatic progressive hardware negotiation (`أعلى دقة مدعومة من هاتف المستخدم تلقائياً`), starting with ideal high resolution and falling back seamlessly to prevent `OverconstrainedError`.
> - **Permission Denied Guidance**: Interactive browser permission guide card (`عرض خطوات تفعيل الكاميرا في المتصفح مع زر إعادة طلب الإذن`) tailored for mobile Chrome and Safari, with one-tap fallbacks to manual entry or image upload.

---

### 1. Overview & Core Concept

- **What It Does**: Refactors the mobile view of the Barcode and QR scanner modal into a responsive, touch-friendly interface. Replaces the cramped, broken toolbar with an ergonomic mobile control strip and integrates an enterprise-grade camera lifecycle engine that eliminates mobile permission errors and hardware stalls.
- **Target Persona & Context**: Retail cashiers, warehouse inventory workers, and store customers using smartphones (360px–430px viewports) in dynamic shop and warehouse environments.
- **Key Value Delivered**: 100% responsive, legible typography without text collisions, instant camera activation on mobile devices, and frictionless fallback flows when permissions are restricted.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Modal Launch**: The scanner opens in a centered responsive modal on desktop and an ergonomic bottom-anchored or full-screen card on mobile with safe-area insets.
2. **Camera Streaming**:
   - The compact top control strip presents clear primary affordances: Camera Switch (`🔄`), Audio/Haptic Toggle (`🔊`), and Options Menu (`⚙️`).
   - Tapping `⚙️` reveals a smooth slide-down panel containing resolution presets, Thermal OCR mode, and camera selection without crowding the viewfinder.
3. **Permission Denied Recovery**:
   - If the browser blocks access, a luxury purple/crimson guidance card appears with platform-specific instructions (Chrome/Safari lock icon walkthrough) and a prominent "إعادة طلب الإذن" (Retry) action.
   - Quick buttons allow immediate one-tap switching to Image Upload or Manual Entry.

#### Visual Identity & Theme
- **Color Discipline**: Ahmed Bahri luxury dark-purple palette (`bg-gray-900 / bg-[#15102a]`, `border-purple-500/30`, vibrant purple/indigo accents, emerald for active sensory feedback, amber for thermal sticker mode).
- **Typography & Touch Targets**:
  - All button labels enforce `whitespace-nowrap shrink-0` with strict flex/grid math, preventing Arabic words from wrapping vertically.
  - Every interactive touch target meets or exceeds WCAG standard $44 \times 44\text{px}$.
- **Viewfinder & Overlay**: Aspect-ratio preserving viewport (`aspect-[4/3]` or responsive flex container) with illuminated laser alignment guides and dynamic HUD badges.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Compact Toolbar with Collapsible Secondary Settings**
  - *Chosen Approach*: Display primary actions (Camera Flip, Audio Mute) as compact pill buttons with icons, while moving secondary controls (Thermal OCR, Resolution/FPS presets) into an expandable options drawer.
  - *Why*: Mobile viewports (360px) cannot physically accommodate 4 full-width descriptive Arabic buttons side-by-side. The compact pattern guarantees zero layout breakage while retaining instant access to all features.
  - *Alternatives Considered*: 2x2 grid (consumes excessive vertical viewport space, pushing the camera feed off-screen).

- **Decision 2: 3-Stage Progressive Constraint Fallback Engine**
  - *Chosen Approach*: Stage 1 requests optimal resolution (1080p/720p). Stage 2 relaxes constraints to hardware-preferred capabilities. Stage 3 falls back to bare video constraints.
  - *Why*: Eliminates `OverconstrainedError` on budget smartphones without sacrificing high fidelity on modern flagship devices.

- **Decision 3: Video Lifecycle & `loadedmetadata` Synchronization**
  - *Chosen Approach*: Wait for the `loadedmetadata` event before calling `video.play()`, while ensuring existing tracks are cleanly unmounted.
  - *Why*: Prevents mobile browser `AbortError` and `NotAllowedError` caused by attempting to play unbuffered media streams.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│               Barcode & QR Scanner Modal               │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌─────────────────────────┐ ┌───────────────────────────┐
│  Mobile Control Strip   │ │  Multi-Stage Camera Engine │
│ ─────────────────────── │ │ ───────────────────────── │
│ • Flip Camera (🔄)      │ │ • Secure Context Guard    │
│ • Sensory Toggle (🔊)   │ │ • Progressive Constraints │
│ • Options Toggle (⚙️)   │ │ • Track Lifecycle Cleanup │
│   └─ Collapsible Drawer │ │ • Error Categorization    │
└─────────────────────────┘ └─────────────┬─────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
      ┌───────────────────────────┐               ┌───────────────────────────┐
      │  Viewfinder & CV Decoder  │               │ Browser Permission Guide  │
      │ ───────────────────────── │               │ ───────────────────────── │
      │ • Native BarcodeDetector  │               │ • Chrome / Safari Steps   │
      │ • ZXing / Thermal Canvas  │               │ • Retry Trigger Button    │
      │ • HUD Laser Overlay       │               │ • Quick Tab Switchers     │
      └───────────────────────────┘               └───────────────────────────┘
```

#### State & Error Flow Mapping
- `cameraStatus`: `"idle" | "requesting" | "streaming" | "permission_denied" | "not_found" | "error"`
- `cameraErrorDetails`: Categorized error codes (`NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError`, `InsecureContext`) mapping directly to tailored guidance cards.
- `optionsDrawerOpen`: Local state controlling smooth disclosure of secondary controls.

---

### 5. Step-by-Step Implementation Strategy

1. **Camera Engine Refactoring (`BarcodeScanner.tsx`)**:
   - Add secure context verification (`window.isSecureContext`).
   - Implement progressive constraint ladder (`stage1` ideal $\rightarrow$ `stage2` relaxed $\rightarrow$ `stage3` bare).
   - Guard `video.play()` with `onloadedmetadata` event listener to prevent mobile video play stalls.
   - Enforce rigorous track cleanup (`track.stop()`) on unmount and tab transitions.

2. **Responsive Mobile Control Strip & Collapsible Options**:
   - Redesign toolbar container to use flex wrap with `gap-2` and `min-w-0`.
   - Implement single-row compact pill controls for mobile viewports with `whitespace-nowrap`.
   - Add expandable secondary options drawer containing Thermal OCR mode, camera device select, and resolution presets.

3. **Contextual Mobile Permission & Recovery UI**:
   - Design step-by-step guidance card for Chrome and Safari mobile permissions.
   - Add primary "إعادة المحاولة" (Retry) button and secondary shortcuts to Manual Input and Image Upload.

4. **Automated Verification & Build Test**:
   - Run compilation checks (`compile_applet`) and automated regression tests.
