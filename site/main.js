// Meno's website: the visitor's own system first, and the story - scrolling
// through it plays Meno's work, recorded from the app, as a film the scroll
// position runs: each chapter's frames drawn on a canvas, the two either
// side of where the scroll is laid over each other, so it moves on smoothly.

(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Offer the visitor's own system first.
  const cta = document.getElementById("cta");
  if (cta && /Windows/i.test(navigator.userAgent)) {
    const win = cta.querySelector('[data-asset="windows"]');
    const mac = cta.querySelector('[data-asset="mac"]');
    win.classList.add("primary");
    mac.classList.remove("primary");
    cta.prepend(win);
  }

  const story = document.getElementById("story");
  const screen = document.getElementById("screen");
  const rail = document.getElementById("rail");
  const heroWindow = document.getElementById("hero-window");
  const chapters = [...document.querySelectorAll(".chapter")];
  story.style.setProperty("--chapters", String(chapters.length));

  // Each chapter's frames: frames/<name>/001.avif, 002.avif, ...
  const sources = chapters.map((ch) =>
    Array.from({ length: Number(ch.dataset.count) }, (_, i) => `${ch.dataset.frames}/${String(i + 1).padStart(3, "0")}.avif`),
  );
  const frames = sources.map(() => null);
  const ready = (img) => img && img.complete && img.naturalWidth > 0;
  /** Starts loading a chapter's frames, once. */
  function load(c) {
    if (c < 0 || c >= chapters.length || frames[c]) return;
    frames[c] = sources[c].map((src) => {
      const img = new Image();
      img.decoding = "async";
      img.addEventListener("load", request, { once: true });
      img.src = src;
      return img;
    });
  }

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  screen.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  function size() {
    const r = screen.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * d));
    canvas.height = Math.max(1, Math.round(r.height * d));
  }
  /** The nearest frame of a chapter that has come, from `i` outwards. */
  function nearest(list, i) {
    for (let k = 0; k < list.length; k++) {
      if (ready(list[i - k])) return list[i - k];
      if (ready(list[i + k])) return list[i + k];
    }
    return null;
  }
  /** Draws chapter `c` at `p` (0 to 1) through its frames. */
  function draw(c, p) {
    const list = frames[c];
    if (!list) return;
    const at = p * (list.length - 1);
    const i = Math.floor(at);
    const t = at - i;
    const a = ready(list[i]) ? list[i] : nearest(list, i);
    if (!a) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.drawImage(a, 0, 0, canvas.width, canvas.height);
    const b = list[i + 1];
    if (a === list[i] && t > 0.01 && ready(b)) {
      ctx.globalAlpha = t;
      ctx.drawImage(b, 0, 0, canvas.width, canvas.height);
    }
    screen.classList.add("playing");
  }

  const pips = chapters.map((ch, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ch.querySelector(".n").textContent.split("·")[1].trim();
    b.addEventListener("click", () => {
      const span = story.offsetHeight - innerHeight;
      scrollTo({ top: story.offsetTop + (span * (i + 0.02)) / chapters.length, behavior: reduce ? "auto" : "smooth" });
    });
    rail.appendChild(b);
    return b;
  });

  function update() {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    root.style.setProperty("--scroll", y.toFixed(1));

    // The hero window lies back, and straightens as it comes up.
    const r = heroWindow.getBoundingClientRect();
    const flat = reduce ? 1 : Math.min(1, Math.max(0, 1 - (r.top - vh * 0.18) / (vh * 0.6)));
    heroWindow.style.setProperty("--flat", flat.toFixed(3));

    // Scrolling through the story runs the film.
    const span = story.offsetHeight - vh;
    const p = Math.min(0.9999, Math.max(0, (y - story.offsetTop) / span));
    const at = p * chapters.length;
    const c = Math.floor(at);
    const local = at - c;
    if (story.getBoundingClientRect().top < vh * 2) {
      load(c);
      load(c + 1);
      load(c - 1);
    }
    chapters.forEach((ch, i) => ch.classList.toggle("on", i === c));
    pips.forEach((b, i) => {
      b.classList.toggle("on", i === c);
      b.setAttribute("aria-current", i === c ? "step" : "false");
      b.style.setProperty("--p", i < c ? "1" : i > c ? "0" : local.toFixed(3));
    });
    draw(c, local);
  }

  let ticking = false;
  function request() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }
  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", () => {
    size();
    request();
  });
  size();
  update();
})();
