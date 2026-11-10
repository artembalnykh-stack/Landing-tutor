/* ==========================================================================
   main.js — вся интерактивность сайта. Без зависимостей.
   1. Появление блоков   2. Шапка   3. Меню   4. Аккордеон
   5. Лайтбокс           6. Липкая полоса CTA   7. Форма   8. Мелочи
   ========================================================================== */

(function () {
  "use strict";

  var $ = function (sel, ctx) {
    return (ctx || document).querySelector(sel);
  };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==========================================================================
     1. Появление блоков при скролле
     ========================================================================== */

  /* Каскад внутри групп */
  $$("[data-stagger]").forEach(function (group) {
    Array.prototype.slice.call(group.children).forEach(function (child, i) {
      if (child.classList.contains("reveal")) {
        child.style.setProperty("--reveal-delay", Math.min(i, 5) * 70 + "ms");
      }
    });
  });

  var revealEls = $$(".reveal");

  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );

    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-in");
    });
  }

  /* Сообщаем страховочному таймеру, что скрипт жив */
  window.__revealReady = true;

  /* ==========================================================================
     2. Шапка
     ========================================================================== */

  var header = $("#site-header");

  function syncHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }

  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });

  /* ==========================================================================
     3. Мобильное меню
     ========================================================================== */

  var burger = $("#burger");
  var menu = $("#menu");

  function openMenu() {
    if (!menu || !burger) return;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Закрыть меню");
    document.body.classList.add("menu-open");

    var first = $("a", menu);
    if (first) {
      window.setTimeout(function () {
        first.focus({ preventScroll: true });
      }, 140);
    }
  }

  function closeMenu(returnFocus) {
    if (!menu || !burger) return;
    if (!menu.classList.contains("is-open")) return;

    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Открыть меню");
    document.body.classList.remove("menu-open");

    if (returnFocus) burger.focus({ preventScroll: true });
  }

  if (burger && menu) {
    burger.addEventListener("click", function () {
      if (burger.getAttribute("aria-expanded") === "true") {
        closeMenu(true);
      } else {
        openMenu();
      }
    });

    $$("a", menu).forEach(function (link) {
      link.addEventListener("click", function () {
        closeMenu(false);
      });
    });

    /* Удержание фокуса внутри меню */
    menu.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;

      var focusables = $$("a, button", menu).filter(function (el) {
        return el.offsetParent !== null;
      });
      if (!focusables.length) return;

      var first = focusables[0];
      var last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= 1024) closeMenu(false);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu(true);
  });

  /* ==========================================================================
     4. Аккордеон FAQ
     ========================================================================== */

  var faqItems = $$(".faq__item");

  function getPanel(item) {
    return $(".faq__panel", item);
  }

  function expandItem(item) {
    var panel = getPanel(item);
    if (!panel) return;

    item.setAttribute("open", "");
    panel.style.height = "0px";

    /* Читаем высоту после применения open */
    var target = panel.scrollHeight;

    requestAnimationFrame(function () {
      panel.style.height = target + "px";
    });

    panel.addEventListener("transitionend", function handler(e) {
      if (e.propertyName !== "height") return;
      panel.removeEventListener("transitionend", handler);
      panel.style.height = "auto";
    });
  }

  function collapseItem(item) {
    var panel = getPanel(item);
    if (!panel) return;

    panel.style.height = panel.scrollHeight + "px";

    requestAnimationFrame(function () {
      panel.style.height = "0px";
    });

    panel.addEventListener("transitionend", function handler(e) {
      if (e.propertyName !== "height") return;
      panel.removeEventListener("transitionend", handler);
      item.removeAttribute("open");
      panel.style.height = "";
    });
  }

  faqItems.forEach(function (item) {
    var summary = $(".faq__q", item);
    var panel = getPanel(item);
    if (!summary || !panel) return;

    if (item.hasAttribute("open")) panel.style.height = "auto";

    summary.addEventListener("click", function (e) {
      e.preventDefault();

      if (item.hasAttribute("open")) {
        collapseItem(item);
        return;
      }

      faqItems.forEach(function (other) {
        if (other !== item && other.hasAttribute("open")) collapseItem(other);
      });

      expandItem(item);
    });
  });

  /* ==========================================================================
     5. Лайтбокс документов
     ========================================================================== */

  var docButtons = $$(".dip__btn");
  var lightbox = $("#lightbox");

  if (lightbox && docButtons.length && typeof lightbox.showModal === "function") {
    var lbImg = $("#lb-img");
    var lbCaption = $("#lb-caption");
    var lbCounter = $("#lb-counter");
    var lbClose = $("#lb-close");
    var current = 0;
    var opener = null;

    var render = function (i) {
      current = (i + docButtons.length) % docButtons.length;
      var btn = docButtons[current];

      lbImg.src = btn.getAttribute("data-doc");
      lbImg.alt = btn.getAttribute("data-caption") || "Документ";
      lbCaption.textContent = btn.getAttribute("data-caption") || "";
      lbCounter.textContent = current + 1 + " / " + docButtons.length;
    };

    var openLightbox = function (i, btn) {
      opener = btn || null;
      render(i);
      document.body.classList.add("scroll-lock");
      lightbox.showModal();
    };

    var closeLightbox = function () {
      if (lightbox.open) lightbox.close();
    };

    docButtons.forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        openLightbox(i, btn);
      });
    });

    if (lbClose) lbClose.addEventListener("click", closeLightbox);

    $("#lb-prev").addEventListener("click", function () {
      render(current - 1);
    });
    $("#lb-next").addEventListener("click", function () {
      render(current + 1);
    });
    $("#lb-prev-m").addEventListener("click", function () {
      render(current - 1);
    });
    $("#lb-next-m").addEventListener("click", function () {
      render(current + 1);
    });

    lightbox.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") {
        render(current + 1);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        render(current - 1);
        e.preventDefault();
      }
    });

    lightbox.addEventListener("click", function (e) {
      var t = e.target;
      if (
        t === lightbox ||
        (t.classList && (t.classList.contains("lightbox__stage") || t.classList.contains("lightbox__figure")))
      ) {
        closeLightbox();
      }
    });

    lightbox.addEventListener("close", function () {
      document.body.classList.remove("scroll-lock");
      if (opener) opener.focus({ preventScroll: true });
    });

    /* Свайп на мобильном */
    var touchX = null;
    lightbox.addEventListener(
      "touchstart",
      function (e) {
        touchX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );
    lightbox.addEventListener(
      "touchend",
      function (e) {
        if (touchX === null) return;
        var dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) < 48) return;
        render(current + (dx < 0 ? 1 : -1));
      },
      { passive: true }
    );
  }

  /* ==========================================================================
     6. Липкая полоса CTA
     ========================================================================== */

  var ctaBar = $("#cta-bar");
  var hero = $("#top");
  var contacts = $("#contacts");

  if (ctaBar && hero) {
    var rafId = null;

    var syncCtaBar = function () {
      rafId = null;

      if (window.innerWidth >= 1024) {
        ctaBar.classList.remove("is-visible");
        return;
      }

      var passedHero = window.scrollY > hero.offsetHeight * 0.8;
      var contactsInView = false;

      if (contacts) {
        var rect = contacts.getBoundingClientRect();
        contactsInView = rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
      }

      ctaBar.classList.toggle("is-visible", passedHero && !contactsInView);
    };

    var requestSync = function () {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(syncCtaBar);
    };

    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);
    syncCtaBar();
  }

  /* ==========================================================================
     7. Форма заявки
     ========================================================================== */

  var yform = $("[data-yform]");

  if (yform) {
    var yframe = $("iframe", yform);
    var yformSized = false; /* высоту формы знаем */
    var yformFrameReady = false; /* страница формы загрузилась */
    var yformOnFile = window.location.protocol === "file:";

    var yformShow = function () {
      yform.classList.remove("is-stalled", "is-unavailable");
      yform.classList.add("is-loaded");
      yform.setAttribute("aria-busy", "false");
    };

    var yformSetHeight = function (px) {
      if (!yframe) return;
      yframe.style.height = px + "px";
    };

    yform.setAttribute("aria-busy", "true");

    /* По file:// сторонние iframe часто не инициализируются:
       сразу показываем резервную карточку, но форму не блокируем —
       если она всё-таки ответит, переключимся на неё. */
    if (yformOnFile) {
      yform.classList.add("is-unavailable");
      yform.setAttribute("aria-busy", "false");
    }

    /* Страница формы пришла — ставим заведомо рабочую высоту,
       чтобы поля не оказались обрезанными. Точную подставим по сообщению. */
    if (yframe) {
      yframe.addEventListener("load", function () {
        yformFrameReady = true;
        if (!yformSized) yformSetHeight(660);

        /* Форма загрузилась — показываем её. Под file:// оставляем карточку:
           там iframe может показать служебную страницу браузера. */
        if (!yformOnFile) yformShow();
      });
    }

    window.addEventListener("message", function (e) {
      if (e.origin !== "https://forms.yandex.ru") return;
      if (!yframe || e.source !== yframe.contentWindow) return;

      var data = e.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (err) {
          return;
        }
      }

      if (!data || !data["iframe-height"]) return;

      /* Форма сообщает свою высоту — выставляем её сами.
         Скрипт Яндекса (embed.js) подгружается асинхронно и может не успеть
         подписаться на сообщение, из-за чего кадр остаётся высотой 160px.
         Слишком маленькие значения (например, 200px у ещё не отрисовавшейся
         формы) игнорируем — иначе поля обрежутся. */
      var height = Number(data["iframe-height"]);
      if (height >= 480) {
        yformSized = true;
        yformSetHeight(height);
      }

      yformShow();
    });

    /* Если форма не подала признак жизни — предлагаем открыть её отдельно */
    window.setTimeout(function () {
      if (yform.classList.contains("is-loaded")) return;

      /* Под file:// остаёмся на карточке: там iframe может показать
         служебную страницу браузера вместо формы. */
      if (yformOnFile) return;

      /* Форма загрузилась, но не сообщила высоту — показываем её
         в заведомо рабочем размере. */
      if (yformFrameReady) {
        if (!yformSized) yformSetHeight(660);
        yformShow();
        return;
      }

      yform.classList.add("is-stalled");
      yform.setAttribute("aria-busy", "false");
    }, 9000);
  }

  /* ==========================================================================
     8. Мелочи
     ========================================================================== */

  /* Год в подвале */
  var yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* Если фото не загрузилось — показываем аккуратную заглушку */
  $$("[data-photo]").forEach(function (box) {
    var img = $("img", box);
    if (!img) return;

    var mark = function () {
      box.classList.add("is-empty");
    };

    if (img.complete && img.naturalWidth === 0) mark();
    img.addEventListener("error", mark);
  });

  /* Плавный переход к якорю с учётом высоты шапки делает CSS scroll-margin-top */
})();
