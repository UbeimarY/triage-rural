import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';

import { ApiClient, describeApiError } from '../../core/api/api-client';
import { ConnectivityService } from '../../core/connectivity.service';
import { Priority } from '../../core/db/models';
import { PriorityBadge } from '../../shared/priority-badge';

interface Summary {
  totalVisits: number;
  byPriority: Record<Priority | 'unclassified', number>;
  awaitingReview: number;
  loweredByPromoter: number;
  byCommunity: { community: string; visits: number }[];
  lastReceivedAt: string | null;
}

interface DashboardVisit {
  encounterId: string;
  patientCode: string;
  community: string;
  age: number;
  symptoms: string;
  alarmCount: number;
  suggestedPriority: Priority | null;
  finalPriority: Priority | null;
  source: string | null;
  reviewed: boolean;
  promoterName: string;
  createdAt: string;
}

type Filter = 'all' | Priority | 'unclassified';

@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, PriorityBadge],
  template: `
    <div class="page-header">
      <h1>Panel de seguimiento</h1>
      <button type="button" class="secondary" (click)="load()" [disabled]="loading()">
        Actualizar
      </button>
    </div>
    <p class="lede">Visitas sincronizadas por todos los promotores, las más urgentes primero.</p>

    @if (!connectivity.online()) {
      <p class="notice" role="status">El panel necesita conexión: muestra datos del servidor.</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (summary(); as s) {
      <section class="stats" aria-label="Resumen">
        <div class="stat stat--high">
          <span class="stat__value">{{ s.byPriority.high }}</span>
          <span>▲ Alta</span>
        </div>
        <div class="stat stat--medium">
          <span class="stat__value">{{ s.byPriority.medium }}</span>
          <span>■ Intermedia</span>
        </div>
        <div class="stat stat--low">
          <span class="stat__value">{{ s.byPriority.low }}</span>
          <span>▼ Baja</span>
        </div>
        <div class="stat">
          <span class="stat__value">{{ s.awaitingReview }}</span>
          <span>Alta sin revisar</span>
        </div>
      </section>

      <p class="meta">
        {{ s.totalVisits }} visitas en total
        @if (s.loweredByPromoter > 0) {
          · {{ s.loweredByPromoter }} con prioridad bajada por el promotor (con motivo escrito)
        }
        @if (s.lastReceivedAt) {
          · última recibida {{ s.lastReceivedAt | date: 'd MMM, h:mm a' }}
        }
      </p>

      @if (s.byCommunity.length > 0) {
        <section class="card">
          <h2>Visitas por comunidad</h2>
          <ul class="bars">
            @for (row of s.byCommunity; track row.community) {
              <li>
                <span class="bars__name">{{ row.community }}</span>
                <span class="bars__track" aria-hidden="true">
                  <span
                    class="bars__fill"
                    [style.width.%]="(row.visits / s.byCommunity[0].visits) * 100"
                  ></span>
                </span>
                <span class="bars__value">{{ row.visits }}</span>
              </li>
            }
          </ul>
        </section>
      }
    }

    <div class="filters" role="group" aria-label="Filtrar por prioridad">
      @for (option of filters; track option.value) {
        <button
          type="button"
          class="chip"
          [class.active]="filter() === option.value"
          [attr.aria-pressed]="filter() === option.value"
          (click)="select(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>

    <ul class="visit-list">
      @for (visit of visits(); track visit.encounterId) {
        <li class="card visit">
          <div class="row">
            <strong>Paciente {{ visit.patientCode }}</strong>
            <app-priority-badge
              [priority]="visit.finalPriority ?? visit.suggestedPriority ?? undefined"
            />
          </div>
          <p class="meta">
            ≈ {{ visit.age }} años · {{ visit.community }} · {{ visit.promoterName }} ·
            {{ visit.createdAt | date: 'd MMM, h:mm a' }}
          </p>
          <p class="symptoms">{{ visit.symptoms }}</p>
          <p class="meta">
            @if (visit.alarmCount > 0) {
              <strong class="alarm">⚠ {{ visit.alarmCount }} signo(s) de alarma</strong> ·
            }
            {{
              visit.source === 'model'
                ? 'Sugerida por la IA'
                : visit.source === 'rules'
                  ? 'Regla de alarma'
                  : 'Sin clasificar'
            }}
            · {{ visit.reviewed ? '✓ revisada por el promotor' : 'sin revisar' }}
          </p>
        </li>
      } @empty {
        @if (!loading()) {
          <li class="muted">No hay visitas sincronizadas con este filtro.</li>
        }
      }
    </ul>
  `,
  styles: `
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 1rem;
    }
    .lede,
    .meta,
    .muted {
      color: var(--color-muted);
    }
    .meta {
      font-size: 0.9rem;
      margin: 0;
    }
    .notice {
      padding: 0.7rem 1rem;
      border-radius: var(--radius);
      background: var(--priority-medium-bg);
      color: var(--priority-medium);
      font-weight: 600;
    }
    .error {
      color: var(--color-danger);
      font-weight: 600;
    }
    .secondary {
      background: var(--color-surface);
      color: var(--color-primary-dark);
      border: 1px solid var(--color-primary);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      margin: 1rem 0;
    }
    .stat {
      display: flex;
      flex-direction: column;
      padding: 0.9rem 1rem;
      border-radius: var(--radius);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      font-weight: 600;
    }
    .stat__value {
      font-size: 2rem;
      font-weight: 800;
      line-height: 1.1;
    }
    .stat--high {
      background: var(--priority-high-bg);
      color: var(--priority-high);
    }
    .stat--medium {
      background: var(--priority-medium-bg);
      color: var(--priority-medium);
    }
    .stat--low {
      background: var(--priority-low-bg);
      color: var(--priority-low);
    }
    .card {
      margin-top: 1rem;
    }
    .bars {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.5rem;
    }
    .bars li {
      display: grid;
      grid-template-columns: minmax(0, 9rem) 1fr 2rem;
      align-items: center;
      gap: 0.75rem;
    }
    .bars__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bars__track {
      height: 0.6rem;
      border-radius: 999px;
      background: var(--color-bg);
      overflow: hidden;
    }
    .bars__fill {
      display: block;
      height: 100%;
      background: var(--color-primary);
    }
    .bars__value {
      text-align: right;
      font-weight: 700;
    }
    .filters {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 1.25rem;
    }
    .chip {
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      border-radius: 999px;
      padding: 0.5rem 1rem;
    }
    .chip.active {
      background: var(--color-primary);
      color: #fff;
      border-color: var(--color-primary);
    }
    .visit-list {
      list-style: none;
      margin: 1rem 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .visit {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin: 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
    }
    .symptoms {
      margin: 0;
    }
    .alarm {
      color: var(--priority-high);
    }
  `,
})
export class DashboardPage {
  private readonly api = inject(ApiClient);
  readonly connectivity = inject(ConnectivityService);

  readonly summary = signal<Summary | null>(null);
  readonly visits = signal<DashboardVisit[]>([]);
  readonly filter = signal<Filter>('all');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'high', label: '▲ Alta' },
    { value: 'medium', label: '■ Intermedia' },
    { value: 'low', label: '▼ Baja' },
    { value: 'unclassified', label: 'Sin clasificar' },
  ];

  constructor() {
    void this.load();
  }

  select(filter: Filter): void {
    this.filter.set(filter);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const filter = this.filter();
    const query = filter === 'all' ? '' : `?priority=${filter}`;
    try {
      const [summary, visits] = await Promise.all([
        this.api.get<Summary>('/dashboard/summary'),
        this.api.get<DashboardVisit[]>(`/dashboard/visits${query}`),
      ]);
      this.summary.set(summary);
      this.visits.set(visits);
    } catch (caught) {
      this.error.set(describeApiError(caught));
    } finally {
      this.loading.set(false);
    }
  }
}
