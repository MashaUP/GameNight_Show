// Modalità leggera per Smart TV e computer lenti: se la TV va a scatti si tolgono sfocature,
// bagliori, particelle e animazioni continue. Automatica (misura i fotogrammi), sempre accesa o spenta.
const KEY = 'gnr_lite';

export const Lite = {
  mode() { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } },
  on() { return document.documentElement.classList.contains('lite'); },

  /** mode: 'auto' | 'on' | 'off' */
  setMode(mode) {
    try { localStorage.setItem(KEY, mode); } catch { /* niente */ }
    this.auto = false;
    this.apply(mode === 'on');
    if (mode === 'auto') this.watch(this.onAuto);
  },

  apply(on) {
    document.documentElement.classList.toggle('lite', Boolean(on));
    window.dispatchEvent(new CustomEvent('gnr-lite', { detail: Boolean(on) }));
  },

  /**
   * Misura i fotogrammi al secondo: se per 4 secondi di fila restano sotto i 22
   * (con la pagina visibile), accende la modalità leggera e chiama onAuto.
   */
  watch(onAuto) {
    this.onAuto = onAuto;
    const m = this.mode();
    if (m === 'on') { this.apply(true); return; }
    if (m === 'off') { this.apply(false); return; }
    if (this.running) return;
    this.running = true;
    let frames = 0;
    let last = performance.now();
    let slow = 0;
    const loop = (t) => {
      if (this.mode() !== 'auto' || this.on()) { this.running = false; return; }
      frames++;
      if (t - last > 3000) { frames = 0; last = t; slow = 0; } // scheda tornata visibile: si ricomincia
      else if (t - last >= 1000) {
        const fps = (frames * 1000) / (t - last);
        frames = 0;
        last = t;
        if (document.visibilityState === 'visible' && fps < 22) slow++;
        else slow = 0;
        if (slow >= 4) {
          this.auto = true;
          this.apply(true);
          this.onAuto?.(Math.round(fps));
          this.running = false;
          return;
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
};
