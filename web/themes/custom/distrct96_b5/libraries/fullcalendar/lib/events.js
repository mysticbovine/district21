/**
 * @file
 * FullCalendar with single-select category filters (Drupal 10).
 *
 * Requirements:
 * - A button group with buttons having class ".fc-filter-btn"
 *   and a data attribute data-cat matching event.extendedProps.category.
 *   Example button markup:
 *     <div id="filterEventsGroup" class="btn-group" role="group">
 *       <button class="btn btn-primary fc-filter-btn active" data-cat="category-904" aria-pressed="true">Training</button>
 *       <button class="btn btn-outline-primary fc-filter-btn" data-cat="category-3" aria-pressed="false">Club Meetings</button>
 *       <button class="btn btn-outline-primary fc-filter-btn" data-cat="category-1" aria-pressed="false">District Events</button>
 *       <button class="btn btn-outline-primary fc-filter-btn" data-cat="category-8" aria-pressed="false">Contests</button>
 *       <!-- Optional: <button class="btn btn-outline-primary fc-filter-btn" data-cat="all">All</button> -->
 *     </div>
 * - A calendar container with id="calendar".
 */

 /**
 * @file
 * FullCalendar with single-select category filters (Drupal 10).
 *
 * The default filter is determined by which .fc-filter-btn
 * has the "active" class in the HTML markup.
 */
(function (Drupal, once) {
  'use strict';

  Drupal.behaviors.calendarWithSingleFilter = {
    attach(context, settings) {
      const calendarEls = once('fc-init', '#calendar', context);
      if (!calendarEls.length) return;

      const filterGroupEls = once('fc-filter-init', '#filterEventsGroup', context);
      const filterGroup = filterGroupEls[0] || context.querySelector('#filterEventsGroup');
      const filterButtons = filterGroup ? filterGroup.querySelectorAll('.fc-filter-btn') : [];

      // --- Find the default from the HTML: the button with .active
      const defaultBtn = filterGroup?.querySelector('.fc-filter-btn.active');
      let activeCategory = defaultBtn ? defaultBtn.getAttribute('data-cat') : 'all';

      function updateButtonsUI() {
        filterButtons.forEach(btn => {
          const cat = btn.getAttribute('data-cat');
          const isOn = (cat === activeCategory);
          btn.classList.toggle('active', isOn);
          btn.classList.toggle('btn-primary', isOn);
          btn.classList.toggle('btn-outline-primary', !isOn);
          btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        });
      }

      const el = calendarEls[0];

      const calendar = new FullCalendar.Calendar(el, {
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        },
        navLinks: true,
        editable: false,
        dayMaxEvents: true,

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

        events: {
          url: '/event/calendar-feed.json',
          failure() {
            const warn = document.getElementById('script-warning');
            if (warn) warn.style.display = 'block';
          }
        },

        // One-time initial filter after load completes
        loading(isLoading) {
          const loadingEl = document.getElementById('loading');
          const calEl = document.getElementById('calendar');
          if (loadingEl) loadingEl.style.display = isLoading ? 'block' : 'none';
          if (calEl) calEl.style.visibility = isLoading ? 'hidden' : 'visible';

          if (!isLoading && !calendar.__didInitialFilter) {
            calendar.__didInitialFilter = true;
            applyFilter();
          }
        }
      });

      function applyFilter() {
        const events = calendar.getEvents();
        calendar.batchRendering(() => {
          for (const ev of events) {
            const cat = ev.extendedProps && String(ev.extendedProps.category).trim();
            const show = (activeCategory === 'all' || activeCategory === cat);
            ev.setProp('display', show ? 'auto' : 'none');
          }
        });
      }

      // Click handler: only one active at a time
      filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          activeCategory = btn.getAttribute('data-cat') || 'all';
          updateButtonsUI();
          applyFilter();
        });
      });

      calendar.render();
      updateButtonsUI(); // syncs UI with whatever was in the markup
      // applyFilter() runs once after load
    }
  };
})(Drupal, once);
