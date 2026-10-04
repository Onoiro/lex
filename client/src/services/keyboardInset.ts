/**
 * Track the on-screen keyboard height and expose it as the
 * `--lex-keyboard-inset` CSS variable on <html>.
 *
 * Android WebView does not always resize the viewport when the keyboard
 * opens: from Android 15 on, edge-to-edge is enforced and
 * `windowSoftInputMode="adjustResize"` is ignored. Sticky elements (the
 * Save bar on the Add page) would then stay hidden behind the keyboard.
 * `visualViewport` reports the actually visible area on every platform,
 * so the layout can lift itself above the keyboard.
 */
const MIN_KEYBOARD_HEIGHT = 100;

export function initKeyboardInset(): void {
  const vv = window.visualViewport;
  if (!vv) return;

  const update = () => {
    const raw = window.innerHeight - vv.height - vv.offsetTop;
    const inset = raw > MIN_KEYBOARD_HEIGHT ? Math.round(raw) : 0;
    document.documentElement.style.setProperty(
      "--lex-keyboard-inset",
      `${inset}px`,
    );
  };

  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}
