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
