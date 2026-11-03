import {
  clampIndex,
  counterText,
  stepIndex,
  viewerAnnouncement,
} from "./lightbox-core.js";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Wire the native dialog into a small, dependency-free media viewer.
 *
 * Returns null when the browser cannot show a modal dialog, which lets the
 * caller fall back to links straight to the original files.
 */
export function createLightbox(dialog) {
  if (!dialog || typeof dialog.showModal !== "function") return null;

  const image = dialog.querySelector("[data-lightbox-image]");
  const caption = dialog.querySelector("[data-lightbox-caption]");
  const meta = dialog.querySelector("[data-lightbox-meta]");
  const counter = dialog.querySelector("[data-lightbox-counter]");
  const announcer = dialog.querySelector("[data-lightbox-announcer]");
  const original = dialog.querySelector("[data-lightbox-original]");
  const previous = dialog.querySelector("[data-lightbox-prev]");
  const next = dialog.querySelector("[data-lightbox-next]");
  const closeButton = dialog.querySelector("[data-lightbox-close]");
  if (
    !image ||
    !caption ||
    !meta ||
    !counter ||
    !announcer ||
    !original ||
    !previous ||
    !next ||
    !closeButton
  ) {
    return null;
  }

  let items = [];
  let index = 0;
  let previouslyFocused = null;
  const preloaded = new Set();

  function preload(source) {
    if (!source || preloaded.has(source)) return;
    preloaded.add(source);
    const probe = new Image();
    probe.decoding = "async";
    probe.src = source;
  }

  function preloadNeighbours() {
    if (items.length < 2) return;
    preload(items[stepIndex(index, items.length, -1)].src);
    preload(items[stepIndex(index, items.length, 1)].src);
  }

  function renderMeta(item) {
    const full = item.meta || "";
    meta.replaceChildren();
    meta.hidden = !full;
    if (!full) {
      dialog.removeAttribute("aria-describedby");
      return;
    }
    dialog.setAttribute("aria-describedby", meta.id || "lightbox-meta");
    if (item.commit && item.commitHref) {
      const link = document.createElement("a");
      link.href = item.commitHref;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "commit " + item.commit;
      meta.appendChild(link);
      if (item.rest) meta.append(" \u00b7 " + item.rest);
      return;
    }
    meta.textContent = full;
  }

  function render() {
    const item = items[index];
    if (!item) return;
    const label = item.caption || item.alt || "Screenshot";
    image.src = item.src;
    image.alt = item.alt || label;
    if (item.width && item.height) {
      image.width = item.width;
      image.height = item.height;
    } else {
      image.removeAttribute("width");
      image.removeAttribute("height");
    }
    caption.textContent = label;
    renderMeta(item);
    counter.textContent = counterText(index, items.length);
    announcer.textContent = viewerAnnouncement(index, items.length, label);
    counter.hidden = items.length < 2;
    previous.hidden = items.length < 2;
    next.hidden = items.length < 2;
    previous.disabled = items.length < 2;
    next.disabled = items.length < 2;
    original.href = item.src;
    preloadNeighbours();
  }

  function show(target) {
    const wanted = clampIndex(target, items.length);
    if (wanted === index) return;
    index = wanted;
    render();
  }

  function step(delta) {
    if (items.length < 2) return;
    index = stepIndex(index, items.length, delta);
    render();
  }

  function focusables() {
    return Array.prototype.slice
      .call(dialog.querySelectorAll(FOCUSABLE))
      .filter(function (element) {
        return !element.hidden && element.getClientRects().length > 0;
      });
  }

  function trapFocus(event) {
    const found = focusables();
    if (!found.length) return;
    const first = found[0];
    const last = found[found.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function open(list, start) {
    const nextItems = (Array.isArray(list) ? list : []).filter(function (item) {
      return item && item.src;
    });
    if (!nextItems.length) return;
    items = nextItems;
    index = clampIndex(start, items.length);
    if (!dialog.open) {
      previouslyFocused =
        document.activeElement && typeof document.activeElement.focus === "function"
          ? document.activeElement
          : null;
      dialog.showModal();
    }
    render();
    document.body.classList.add("lightbox-open");
    closeButton.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  closeButton.addEventListener("click", close);
  previous.addEventListener("click", function () {
    step(-1);
  });
  next.addEventListener("click", function () {
    step(1);
  });
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", function () {
    document.body.classList.remove("lightbox-open");
    items = [];
    if (previouslyFocused && previouslyFocused.isConnected) {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
  });
  dialog.addEventListener("keydown", function (event) {
    if (event.key === "Tab") {
      trapFocus(event);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      show(0);
    } else if (event.key === "End") {
      event.preventDefault();
      show(items.length - 1);
    }
  });

  return { open: open, close: close };
}
