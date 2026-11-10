import { Component, computed, input } from '@angular/core';

/**
 * Line icons drawn for the app. Emoji look different on every phone (and some old
 * Android phones show empty boxes), so navigation uses these instead.
 */
const PATHS = {
  patients:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5 M16 4.3a3.5 3.5 0 0 1 0 6.5 M18 14.8c2 .7 3.2 2.5 3.5 5.2',
  register: 'M12 5v14 M5 12h14',
  panel: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3 M10 17l5-5-5-5 M15 12H4',
  login: 'M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3 M14 7l5 5-5 5 M19 12H8',
  cross: 'M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6Z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  today:
    'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z M4 10h16 M8 3v4 M16 3v4 M9 15l2 2 4-4',
};

export type IconName = keyof typeof PATHS;

@Component({
  selector: 'app-icon',
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 24 24">
      <path
        [attr.d]="path()"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    svg {
      width: 1.5rem;
      height: 1.5rem;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly path = computed(() => PATHS[this.name()]);
}
