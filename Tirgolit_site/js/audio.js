// Audio management using HTML5 Audio
const AudioMgr = (() => {
  let current = null;
  let enabled = true;

  function play(src) {
    if (!enabled) return;
    try {
      if (current) {
        current.pause();
        current.currentTime = 0;
      }
      current = new window.Audio(src.replace(/\.wav$/i, '.mp3'));
      current.play().catch(() => {});
    } catch (e) {}
  }

  function playAnim(animPath) {
    play('./assets/anim/' + animPath.replace(/\.wav$/i, '.mp3'));
  }

  function playMenu(menuPath) {
    play('./assets/menu/' + menuPath.replace(/\.wav$/i, '.mp3'));
  }

  function toggle() {
    enabled = !enabled;
    if (!enabled && current) {
      current.pause();
    }
    return enabled;
  }

  function isEnabled() { return enabled; }

  return { play, playAnim, playMenu, toggle, isEnabled };
})();
