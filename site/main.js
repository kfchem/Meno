// Meno's website: the visitor's own system first, and the story - scrolling
// through it moves Meno's work on, frame by frame.

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
  const storyWindow = document.getElementById("story-window");
  const chapters = [...document.querySelectorAll(".chapter")];
  story.style.setProperty("--chapters", String(chapters.length));

  // Each chapter's frames: frames/<name>/01.avif, 02.avif, ...
  const sources = chapters.map((ch) =>
    Array.from({ length: Number(ch.dataset.count) }, (_, i) => `${ch.dataset.frames}/${String(i + 1).padStart(2, "0")}.avif`),
  );
  const first = screen.querySelector("img");
  let frames = null;
  /** Makes the frames' images once the story comes near; the first is the one already shown. */
  function loadFrames() {
    if (frames) return;
    frames = sources.map((list, c) =>
      list.map((src, i) => {
        if (c === 0 && i === 0) return first;
        const img = new Image();
        img.decoding = "async";
        img.alt = "";
        img.src = src;
        screen.appendChild(img);
        return img;
      }),
    );
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

  let shown = { c: 0, f: 0 };
  function update() {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    root.style.setProperty("--scroll", y.toFixed(1));

    // The hero window lies back, and straightens as it comes up.
    const r = heroWindow.getBoundingClientRect();
    const flat = reduce ? 1 : Math.min(1, Math.max(0, 1 - (r.top - vh * 0.18) / (vh * 0.6)));
    heroWindow.style.setProperty("--flat", flat.toFixed(3));

    // Scrolling through the story moves the work on.
    if (story.getBoundingClientRect().top < vh * 2) loadFrames();
    const span = story.offsetHeight - vh;
    const p = Math.min(0.9999, Math.max(0, (y - story.offsetTop) / span));
    const at = p * chapters.length;
    const c = Math.floor(at);
    const local = at - c;
    chapters.forEach((ch, i) => ch.classList.toggle("on", i === c));
    pips.forEach((b, i) => {
      b.classList.toggle("on", i === c);
      b.setAttribute("aria-current", i === c ? "step" : "false");
      b.style.setProperty("--p", i < c ? "1" : i > c ? "0" : local.toFixed(3));
    });
    if (frames) {
      const f = Math.min(frames[c].length - 1, Math.floor(local * frames[c].length));
      if (f !== shown.f || c !== shown.c) {
        frames[shown.c][shown.f].classList.remove("on");
        frames[c][f].classList.add("on");
        shown = { c, f };
      }
    }
    storyWindow.style.setProperty("--zoom", reduce ? "0" : local.toFixed(3));
  }

  let ticking = false;
  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", request);
  update();
})();
