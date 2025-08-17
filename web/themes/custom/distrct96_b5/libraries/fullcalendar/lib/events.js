/**
 * @file
 * FullCalendar (v5.11 compatible) with single-select category filter.
 *
 * - Default filter is whichever .fc-filter-btn has "active" in your HTML block.
 * - Global singleton guard prevents duplicate calendars.
 * - Uses eventDataTransform so the initial render is filtered.
 * - Guarantees only ONE event source (dedupes on every load).
 */
 (function (Drupal, once) {
  'use strict';

  Drupal.behaviors.calendarWithSingleFilter = {
    attach(context, settings) {
      // Hard singleton: never create more than one calendar.
      if (window.__fcCalendarInstance) {
        // console.warn('[calendar] init skipped: instance already exists.');
        return;
      }

      const calendarEls = once('fc-init', '#calendar', context);
      if (!calendarEls.length) return;
      const el = calendarEls[0];

      if (document.querySelectorAll('#calendar').length > 1) {
        console.warn('[calendar] Multiple #calendar elements found; aborting to avoid duplicates.');
        return;
      }

      // ---------- Helpers ----------
      const FEED_URL = '/event/calendar-feed.json';

      function norm(val) {
        if (val == null) return '';
        const s = String(val).trim().toLowerCase();
        if (s === 'all') return 'all';
        const m = s.match(/\d+/);
        return m ? m[0] : s;
      }

      function getFilterGroup() {
        return document.getElementById('filterEventsGroup') || null;
      }

      function readDefaultFromMarkup() {
        const group = getFilterGroup();
        if (!group) return null;
        const btn = group.querySelector('.fc-filter-btn.active');
        return btn ? (btn.getAttribute('data-cat') || 'all') : 'all';
      }

      let activeCategoryRaw = readDefaultFromMarkup() || 'all';
      let activeCategory = norm(activeCategoryRaw);
      let buttonsWired = false;

      function updateButtonsUI(group) {
        const buttons = group.querySelectorAll('.fc-filter-btn');
        buttons.forEach(btn => {
          const catRaw = btn.getAttribute('data-cat') || 'all';
          const isOn = norm(catRaw) === activeCategory;
          btn.classList.toggle('active', isOn);
          btn.classList.toggle('btn-primary', isOn);
          btn.classList.toggle('btn-outline-primary', !isOn);
          btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        });
      }

      function wireButtonsIfPresent() {
        const group = getFilterGroup();
        if (!group) return false;

        const buttons = group.querySelectorAll('.fc-filter-btn');

        if (!buttonsWired) {
          const fromMarkup = readDefaultFromMarkup();
          if (fromMarkup) {
            activeCategoryRaw = fromMarkup;
            activeCategory = norm(activeCategoryRaw);
          }
        }

        buttons.forEach(btn => {
          if (btn.dataset.wired === '1') return;
          btn.dataset.wired = '1';
          btn.addEventListener('click', () => {
            activeCategoryRaw = btn.getAttribute('data-cat') || 'all';
            activeCategory = norm(activeCategoryRaw);
            updateButtonsUI(group);
            applyFilter(); // update current events
          });
        });

        updateButtonsUI(group);
        buttonsWired = true;
        return true;
      }

      // ---------- Calendar ----------
      const calendar = new FullCalendar.Calendar(el, {
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        },
        navLinks: true,
        editable: false,
        dayMaxEvents: true,

        // Filter every event before it is rendered.
        eventDataTransform(raw) {
          const fromMarkup = readDefaultFromMarkup();
          if (fromMarkup) {
            activeCategoryRaw = fromMarkup;
            activeCategory = norm(activeCategoryRaw);
          }
          const evCat = norm(
            (raw.extendedProps && (raw.extendedProps.category ?? raw.extendedProps.Category ?? raw.extendedProps.type))
            ?? raw.category ?? raw.className
          );
          const show = (activeCategory === 'all') || (evCat === activeCategory);
          return Object.assign({}, raw, { display: show ? 'auto' : 'none' });
        },

        eventDidMount(arg) {
          if (window.bootstrap && bootstrap.Tooltip) {
            arg.el._fcTooltip = new bootstrap.Tooltip(arg.el, {
              title: arg.event.title,
              placement: 'top',
              trigger: 'hover',
              container: 'body',
              customClass: 'THIS-STYLED'
            });
          }
        },
        eventWillUnmount(arg) {
          if (arg.el && arg.el._fcTooltip) {
            arg.el._fcTooltip.dispose();
            delete arg.el._fcTooltip;
          }
        },

        // Use a single, named event source so we can dedupe if anything adds another.
        eventSources: [
          {
            id: 'main-feed',
            url: FEED_URL,
            failure() {
              const warn = document.getElementById('script-warning');
              if (warn) warn.style.display = 'block';
            }
          }
        ],

        // After each fetch completes (including nav), re-apply filter and ensure only one source exists.
        loading(isLoading) {
          const loadingEl = document.getElementById('loading');
          if (loadingEl) loadingEl.style.display = isLoading ? 'block' : 'none';
          el.style.visibility = isLoading ? 'hidden' : 'visible';

          if (!isLoading) {
            wireButtonsIfPresent();
            ensureSingleEventSource();
            applyFilter();
          }
        }
      });

      // Singleton for safety/debug
      window.__fcCalendarInstance = calendar;

      // If the filter block isn’t present yet, watch briefly and wire when it appears.
      if (!wireButtonsIfPresent()) {
        const observer = new MutationObserver((muts, obs) => {
          if (wireButtonsIfPresent()) obs.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 10000);
      }

      function applyFilter() {
        const evs = calendar.getEvents();
        calendar.batchRendering(() => {
          for (const ev of evs) {
            const evCat = norm(
              (ev.extendedProps && (ev.extendedProps.category ?? ev.extendedProps.Category ?? ev.extendedProps.type)) ?? ''
            );
            const show = (activeCategory === 'all') || (evCat === activeCategory);
            ev.setProp('display', show ? 'auto' : 'none');
          }
        });
      }

      // Keep only one event source with our FEED_URL.
      function ensureSingleEventSource() {
        const sources = calendar.getEventSources();
        const matching = sources.filter(s => s.url === FEED_URL);
        if (matching.length > 1) {
          // Keep the first, remove the rest.
          for (let i = 1; i < matching.length; i++) {
            matching[i].remove();
          }
          // Optionally refetch to normalize state:
          // matching[0].refetch();
          // console.warn('[calendar] Removed duplicate event sources:', matching.length - 1);
        }
      }

      calendar.render();

      // Also run a dedupe immediately after render (in case something raced).
      ensureSingleEventSource();
    }
  };
})(Drupal, once);
