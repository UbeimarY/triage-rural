import { Component, computed, input } from '@angular/core';
import { Priority } from '../core/db/models';

const DISPLAY: Record<Priority | 'pending', { icon: string; label: string }> = {
  high: { icon: '▲', label: 'Prioridad alta' },
  medium: { icon: '■', label: 'Prioridad intermedia' },
  low: { icon: '▼', label: 'Prioridad baja' },
  pending: { icon: '…', label: 'Clasificando' },
};

/** Priority shown with icon + text + color: never color alone. */
@Component({
  selector: 'app-priority-badge',
  template: `
    <span class="badge" [attr.data-priority]="key()">
      <span aria-hidden="true">{{ display().icon }}</span>
      {{ display().label }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex; align-items: center; gap: 0.35rem;
      padding: 0.25rem 0.7rem; border-radius: 999px;
      font-size: 0.85rem; font-weight: 700; white-space: nowrap;
      background: var(--color-bg); color: var(--color-muted);
    }
    [data-priority='high'] { background: var(--priority-high-bg); color: var(--priority-high); }
    [data-priority='medium'] { background: var(--priority-medium-bg); color: var(--priority-medium); }
    [data-priority='low'] { background: var(--priority-low-bg); color: var(--priority-low); }
  `,
})
export class PriorityBadge {
  readonly priority = input<Priority | undefined>(undefined);
  readonly key = computed(() => this.priority() ?? 'pending');
  readonly display = computed(() => DISPLAY[this.key()]);
}
