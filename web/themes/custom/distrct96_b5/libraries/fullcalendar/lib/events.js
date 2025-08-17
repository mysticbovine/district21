/**
 * FullCalendar (v5.11) with single-select category filter + source de-dupe. H
 *
 * - Default filter = whichever .fc-filter-btn has "active" in your HTML.
 * - Adds /event/calendar-feed.json only if it's not already present.
 * - On every load-complete, re-applies filter and removes duplicate sources.
 */
 /**
 * FullCalendar v5.11 — single-select filter, hard de-dupe.
 * - Default comes from .fc-filter-btn.active (your HTML block).
 * - One calendar instance only.
 * - Exactly one event source kept; any extras are removed *and their events cleared*.
 * - Filter applied on initial render and after every fetch.
 */
  (function (Drupal, once) {
    'use strict';
  
    Drupal.behaviors.calendarWithSingleFilter = {
      attach(context, settings) {
        // Singleton: only one calendar instance.
        if (window.__fcCalendarInstance) return;
  
        const calEls = once('fc-init', '#calendar', context);
        if (!calEls.length) return;
        const el = calEls[0];
  
        // Safety: only one #calendar in DOM.
        if (document.querySelectorAll('#calendar').length > 1) {
          console.warn('[calendar] Multiple #calendar elements found; aborting.');
          return;
        }
  
        // ---- Config
        const FEED_URL = '/event/calendar-feed.json';
  
        // Normalize category keys: "category-904" | "904" | 904 -> "904"; "all" -> "all".
        const norm = (val) => {
          if (val == null) return '';
          const s = String(val).trim().toLowerCase();
          if (s === 'all') return 'all';
          const m = s.match(/\d+/);
          return m ? m[0] : s;
        };
  
        const getFilterGroup = () => document.getElementById('filterEventsGroup') || null;
        const readDefault = () => {
          const g = getFilterGroup();
          if (!g) return null;
          const btn = g.querySelector('.fc-filter-btn.active');
          return btn ? (btn.getAttribute('data-cat') || 'all') : 'all';
        };
  
        // Active category comes from whichever button has .active in your HTML.
        let activeRaw = readDefault() || 'all';
        let active = norm(activeRaw);
        let buttonsWired = false;
  
        function updateButtonsUI(group) {
          group.querySelectorAll('.fc-filter-btn').forEach(btn => {
            const catRaw = btn.getAttribute('data-cat') || 'all';
            const isOn = norm(catRaw) === active;
            btn.classList.toggle('active', isOn);
            btn.classList.toggle('btn-primary', isOn);
            btn.classList.toggle('btn-outline-primary', !isOn);
            btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
          });
        }
  
        function wireButtonsIfPresent() {
          const group = getFilterGroup();
          if (!group) return false;
  
          if (!buttonsWired) {
            const fromMarkup = readDefault();
            if (fromMarkup) { activeRaw = fromMarkup; active = norm(activeRaw); }
          }
  
          group.querySelectorAll('.fc-filter-btn').forEach(btn => {
            if (btn.dataset.wired === '1') return;
            btn.dataset.wired = '1';
            btn.addEventListener('click', () => {
              activeRaw = btn.getAttribute('data-cat') || 'all';
              active = norm(activeRaw);
              updateButtonsUI(group);
              applyFilter(); // hide/show current events only
            });
          });
  
          updateButtonsUI(group);
          buttonsWired = true;
          return true;
        }
  
        // ---- Calendar (no dedupe / no dynamic source juggling)
        const calendar = new FullCalendar.Calendar(el, {
          headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
          },
          navLinks: true,
          editable: false,
          dayMaxEvents: true,
  
          // Ensure initial paint respects the default filter.
          eventDataTransform(raw) {
            const fromMarkup = readDefault();
            if (fromMarkup) { activeRaw = fromMarkup; active = norm(activeRaw); }
            const evCat = norm(
              (raw.extendedProps && (raw.extendedProps.category ?? raw.extendedProps.Category ?? raw.extendedProps.type))
              ?? raw.category ?? raw.className
            );
            const show = (active === 'all') || (evCat === active);
            return Object.assign({}, raw, { display: show ? 'auto' : 'none' });
          },
  
          // Tooltips only; no visibility changes here.
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
  
          // One static source. We do not add/remove sources in code anymore.
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
  
          // Spinner only (no dedupe/filtering here).
          loading(isLoading) {
            const loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = isLoading ? 'block' : 'none';
            el.style.visibility = isLoading ? 'hidden' : 'visible';
          }
        });
  
        window.__fcCalendarInstance = calendar;
        calendar.render();
  
        // Filter: hide/show current events based on 'active'.
        function applyFilter() {
          const evs = calendar.getEvents();
          calendar.batchRendering(() => {
            for (const ev of evs) {
              const evCat = norm(
                (ev.extendedProps && (ev.extendedProps.category ?? ev.extendedProps.Category ?? ev.extendedProps.type)) ?? ''
              );
              const show = (active === 'all') || (evCat === active);
              ev.setProp('display', show ? 'auto' : 'none');
            }
          });
        }
  
        // Wire the buttons now, or when the block appears.
        if (!wireButtonsIfPresent()) {
          const observer = new MutationObserver((muts, obs) => {
            if (wireButtonsIfPresent()) obs.disconnect();
          });
          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => observer.disconnect(), 10000);
        }
      }
    };
  })(Drupal, once);
  