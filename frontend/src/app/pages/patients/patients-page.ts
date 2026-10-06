import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EncounterRepository, VisitSummary } from '../../core/db/encounter.repository';
import { SyncStatus } from '../../core/db/models';
import { ALARM_SIGNS } from '../../core/triage/alarm-signs';
import { TriageRunner } from '../../core/triage/triage-runner.service';
import { PriorityBadge } from '../../shared/priority-badge';

const SYNC_LABELS: Record<SyncStatus, string> = {
  pending: '⏳ Pendiente de sincronizar',
  synced: '✓ Sincronizado',
  error: '⚠ Error al sincronizar',
};

@Component({
  selector: 'app-patients-page',
  imports: [DatePipe, RouterLink, PriorityBadge],
  template: `
    <div class="page-header">
      <h1>Pacientes</h1>
      @if (pendingCount() > 0) {
        <span class="pending-pill">{{ pendingCount() }} cambios sin sincronizar</span>
      }
    </div>

    @if (justSaved()) {
      <p class="saved" role="status">✓ Registro guardado en este dispositivo.</p>
    }

    @if (visits(); as list) {
      @if (list.length === 0) {
        <section class="card empty-state">
          <p>Aún no hay pacientes registrados.</p>
          <a class="button" routerLink="/encounters/new">Registrar el primero</a>
        </section>
      } @else {
        <ul class="visit-list">
          @for (visit of list; track visit.encounter.id) {
            <li class="card visit">
              <div class="row">
                <strong>Paciente {{ visit.patient.code }}</strong>
                <app-priority-badge [priority]="visit.assessment?.priority" />
              </div>
              <p class="meta">
                ≈ {{ age(visit.patient.birthYear) }} años · {{ visit.patient.community }} ·
                {{ visit.encounter.updatedAt | date: 'd MMM, h:mm a' }}
              </p>
              <p class="symptoms">{{ visit.encounter.symptoms }}</p>
              @if (visit.assessment) {
                <p class="reason" [class.alarm]="visit.assessment.triggeredAlarms.length > 0">
                  {{ reasonText(visit) }}
                </p>
              }
              <div class="row">
                <span class="sync" [attr.data-status]="visit.encounter.syncStatus">
                  {{ syncLabel(visit.encounter.syncStatus) }}
                </span>
                <a class="button secondary" [routerLink]="['/encounters', visit.encounter.id, 'edit']">Editar</a>
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <p class="muted">Cargando registros...</p>
    }
  `,
  styles: `
    .page-header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
    .pending-pill {
      padding: 0.25rem 0.7rem; border-radius: 999px;
      background: var(--priority-medium-bg); color: var(--priority-medium);
      font-size: 0.85rem; font-weight: 700;
    }
    .saved { padding: 0.7rem 1rem; border-radius: var(--radius); background: var(--priority-low-bg); color: var(--priority-low); font-weight: 600; }

    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; text-align: center; }

    .visit-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .visit { display: flex; flex-direction: column; gap: 0.4rem; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .meta, .muted { margin: 0; color: var(--color-muted); font-size: 0.9rem; }
    .symptoms {
      margin: 0;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .reason { margin: 0; font-size: 0.9rem; color: var(--color-muted); }
    .reason.alarm { color: var(--priority-high); font-weight: 700; }
    .sync { font-size: 0.8rem; font-weight: 700; color: var(--priority-medium); }
    .sync[data-status='synced'] { color: var(--priority-low); }
    .sync[data-status='error'] { color: var(--color-danger); }
    .secondary { background: var(--color-surface); color: var(--color-primary-dark); border: 1px solid var(--color-primary); }
    .secondary:hover { background: var(--color-bg); }
  `,
})
export class PatientsPage {
  private readonly repository = inject(EncounterRepository);
  private readonly currentYear = new Date().getFullYear();

  readonly visits = toSignal(this.repository.watchVisits(), { initialValue: null });
  readonly pendingCount = toSignal(this.repository.watchPendingCount(), { initialValue: 0 });
  readonly justSaved = signal(history.state?.saved === true);

  constructor() {
    // Show the confirmation only once (not again after a page reload)
    if (this.justSaved()) {
      history.replaceState({ ...history.state, saved: false }, '');
    }
    // Classify any visit left without a result
    void inject(TriageRunner).classifyMissing();
  }

  syncLabel(status: SyncStatus): string {
    return SYNC_LABELS[status];
  }

  age(birthYear: number): number {
    return this.currentYear - birthYear;
  }

  reasonText(visit: VisitSummary): string {
    const assessment = visit.assessment;
    if (!assessment) return '';
    if (assessment.triggeredAlarms.length > 0) {
      const names = assessment.triggeredAlarms.map(
        (key) => ALARM_SIGNS.find((sign) => sign.key === key)?.shortLabel ?? key,
      );
      return `⚠ Regla de alarma: ${names.join(', ')}`;
    }
    return 'Sin signos de alarma · prioridad provisional, revísala según tu criterio';
  }
}
