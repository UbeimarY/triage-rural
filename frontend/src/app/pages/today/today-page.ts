import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EncounterRepository, VisitSummary } from '../../core/db/encounter.repository';
import { SessionStore } from '../../core/auth/session.store';
import { explainResult } from '../../core/triage/explain';
import { effectivePriority, sortByAttention } from '../../core/triage/priority-order';
import { TriageRunner } from '../../core/triage/triage-runner.service';
import { Icon } from '../../shared/icon';
import { PriorityBadge } from '../../shared/priority-badge';

/**
 * The promoter's start screen: who to attend first, what is left to review or
 * send, and one tap to register the next visit.
 */
@Component({
  selector: 'app-today-page',
  imports: [DatePipe, RouterLink, Icon, PriorityBadge],
  template: `
    <section class="hero" aria-labelledby="hero-title">
      <svg class="ridge" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 96 L46 70 L82 84 L130 40 L168 66 L214 22 L262 62 L300 48 L346 76 L400 58" />
        <path d="M0 112 L60 92 L112 102 L170 76 L228 96 L284 80 L340 98 L400 86" />
      </svg>
      <p class="date">{{ now() | date: "EEEE d 'de' MMMM" }}</p>
      <h1 id="hero-title">{{ greeting() }}</h1>

      @if (visits()) {
        @if (attention().length > 0) {
          <p class="headline">
            <span class="count">{{ attention().length }}</span>
            <span
              >{{ attention().length === 1 ? 'persona necesita' : 'personas necesitan' }} atención
              primero</span
            >
          </p>
        } @else {
          <p class="headline calm">Nadie espera con prioridad alta sin revisar.</p>
        }
      }
      <a class="button register" routerLink="/encounters/new">
        <app-icon name="register" />
        Registrar visita
      </a>
    </section>

    @if (attention().length > 0) {
      <section aria-labelledby="first-title">
        <h2 id="first-title">Atiende primero</h2>
        <ol class="queue">
          @for (visit of attention(); track visit.encounter.id) {
            <li class="card queue-item">
              <div class="row">
                <strong>Paciente {{ visit.patient.code }}</strong>
                <app-priority-badge [priority]="priorityOf(visit)" />
              </div>
              <p class="meta">
                {{ visit.patient.community }} · espera {{ waiting(visit.encounter.createdAt) }}
              </p>
              <p class="reason">{{ reason(visit) }}</p>
            </li>
          }
        </ol>
        <a routerLink="/patients">Revisar en la lista de pacientes</a>
      </section>
    }

    <section class="facts" aria-label="Resumen del día">
      <p class="fact">
        <span class="fact__value">{{ todayVisits().length }}</span>
        <span>{{ todayVisits().length === 1 ? 'visita hoy' : 'visitas hoy' }}</span>
      </p>
      <p class="fact">
        <span class="fact__value">{{ toReview() }}</span>
        <span>sin revisar</span>
      </p>
      <p class="fact" [class.warn]="pendingCount() > 0">
        <span class="fact__value">{{ pendingCount() }}</span>
        <span>por sincronizar</span>
      </p>
    </section>

    @if (todayVisits().length > 0) {
      <section aria-labelledby="recent-title">
        <h2 id="recent-title">Visitas de hoy</h2>
        <ul class="recent">
          @for (visit of todayVisits(); track visit.encounter.id) {
            <li>
              <span class="time">{{ visit.encounter.createdAt | date: 'h:mm a' }}</span>
              <span class="who">{{ visit.patient.code }} · {{ visit.patient.community }}</span>
              <app-priority-badge [priority]="priorityOf(visit)" />
            </li>
          }
        </ul>
      </section>
    } @else if (visits()) {
      <p class="empty">
        Todavía no registras visitas hoy. Todo lo que registres queda guardado en este teléfono,
        aunque no haya señal.
      </p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      max-width: 720px;
      margin: 0 auto;
    }

    .hero {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding: 1.25rem 1.25rem 1.5rem;
      border-radius: calc(var(--radius) + 6px);
      background: var(--color-primary-dark);
      color: #fff;
    }
    /* The ridges of the Andes around Pasto: the place the promoters walk every day. */
    .ridge {
      position: absolute;
      inset: auto 0 0 0;
      width: 100%;
      height: 45%;
      pointer-events: none;
    }
    .ridge path {
      fill: none;
      stroke: rgb(255 255 255 / 0.16);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
    .date::first-letter {
      text-transform: uppercase;
    }
    .date {
      margin: 0;
      opacity: 0.85;
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(1.6rem, 6vw, 2.1rem);
    }
    .headline {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 0.5rem 0;
      font-size: 1.15rem;
      font-weight: 700;
      line-height: 1.25;
    }
    .count {
      display: grid;
      place-items: center;
      min-width: 3.5rem;
      height: 3.5rem;
      padding: 0 0.5rem;
      border-radius: 14px;
      background: #fff;
      color: var(--priority-high);
      font-size: 2.2rem;
      font-variant-numeric: tabular-nums;
    }
    .headline.calm {
      font-weight: 600;
      opacity: 0.95;
    }
    .register {
      position: relative;
      align-self: flex-start;
      margin-top: 0.5rem;
      min-height: 56px;
      padding-inline: 1.5rem;
      background: #fff;
      color: var(--color-primary-dark);
      font-size: 1.1rem;
    }
    .register:hover:not(:disabled) {
      background: #e6f2ee;
    }

    h2 {
      font-size: 1.2rem;
    }
    .queue {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      margin: 0 0 0.75rem;
      padding: 0;
      list-style: none;
    }
    .queue-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 1rem;
      border-left: 6px solid var(--priority-high);
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .meta,
    .reason {
      margin: 0;
      color: var(--color-muted);
      font-size: 0.95rem;
    }
    .reason {
      color: var(--color-text);
    }

    .facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.5rem;
    }
    .fact {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0.75rem;
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-surface);
      font-size: 0.9rem;
      color: var(--color-muted);
    }
    .fact__value {
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--color-text);
      font-variant-numeric: tabular-nums;
    }
    .fact.warn .fact__value {
      color: var(--priority-medium);
    }

    .recent {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .recent li {
      display: grid;
      grid-template-columns: 4.8rem 1fr auto;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--color-border);
    }
    .time {
      color: var(--color-muted);
      font-variant-numeric: tabular-nums;
    }
    .who {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .empty {
      color: var(--color-muted);
    }
  `,
})
export class TodayPage {
  private readonly repository = inject(EncounterRepository);
  private readonly session = inject(SessionStore);

  readonly visits = toSignal(this.repository.watchVisits(), { initialValue: null });
  readonly pendingCount = toSignal(this.repository.watchPendingCount(), { initialValue: 0 });
  /** Refreshed every minute so waiting times stay current. */
  readonly now = signal(new Date());

  readonly greeting = computed(() => {
    const hour = this.now().getHours();
    const part = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const name = this.session.user()?.fullName.split(' ')[0];
    return name ? `${part}, ${name}` : part;
  });

  /** High priority (suggested or chosen) and not reviewed yet, or not classified yet. */
  readonly attention = computed(() =>
    sortByAttention(this.visits() ?? []).filter(
      (visit) =>
        !visit.assessment ||
        (effectivePriority(visit.assessment) === 'high' && !visit.assessment.reviewedAt),
    ),
  );

  readonly todayVisits = computed(() => {
    const start = new Date(this.now());
    start.setHours(0, 0, 0, 0);
    return (this.visits() ?? [])
      .filter((visit) => new Date(visit.encounter.createdAt) >= start)
      .sort((a, b) => b.encounter.createdAt.localeCompare(a.encounter.createdAt));
  });

  readonly toReview = computed(
    () => (this.visits() ?? []).filter((v) => v.assessment && !v.assessment.reviewedAt).length,
  );

  constructor() {
    void inject(TriageRunner).classifyMissing();
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  priorityOf(visit: VisitSummary) {
    return effectivePriority(visit.assessment);
  }

  reason(visit: VisitSummary): string {
    return visit.assessment ? explainResult(visit.assessment) : 'En clasificación…';
  }

  waiting(createdAt: string): string {
    const minutes = Math.max(
      0,
      Math.round((this.now().getTime() - Date.parse(createdAt)) / 60_000),
    );
    if (minutes < 1) return 'desde hace un momento';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d`;
  }
}
