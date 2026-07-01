// Audio management using HTML5 Audio.
//
// Fix for #59 "chicken game bugs #3: when pressing multiple things at once
// it plays both sounds instead of stopping one of them" — the previous
// implementation created a NEW Audio element per play() call. Calling
// pause() on the old element only interrupts its current playback state;
// if the load was still in flight, the orphaned Audio could complete
// buffering and start playing alongside the new one. Result: overlapping
// audio on rapid clicks (each click = one AAA/click sound triggered).
//
// Fix: reuse a single Audio element across every play() call, swapping
// the src rather than allocating new objects. Same pattern already used
// by Kesem's playAudio() and hemed_nivim's HND.playWave. Old load is
// implicitly cancelled by src reassignment.
const AudioMgr = (() => {
  let audio = null;
  let enabled = true;

  function ensure() {
    if (!audio) {
      audio = new window.Audio();
      audio.preload = 'auto';
    }
    return audio;
  }

  function play(src) {
    if (!enabled) return;
    try {
      const a = ensure();
      a.pause();
      a.src = src.replace(/\.wav$/i, '.mp3');
      a.currentTime = 0;
      // .play() returns a Promise that rejects with AbortError when the
      // load is superseded by a subsequent src reassignment; swallow so
      // the console stays clean. NotAllowedError (browser autoplay block)
      // is also silently absorbed — the next user-gesture click will
      // succeed.
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
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
    if (!enabled && audio) audio.pause();
    return enabled;
  }

  function isEnabled() { return enabled; }

  return { play, playAnim, playMenu, toggle, isEnabled };
})();
