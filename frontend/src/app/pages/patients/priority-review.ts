import { Component, computed, inject, input, output, signal } from '@angular/core';
import { EncounterRepository } from '../../core/db/encounter.repository';
import { Priority, TriageAssessment } from '../../core/db/models';
import { isLowering } from '../../core/triage/priority-order';
import { PRIORITY_DISPLAY } from '../../shared/priority-badge';

const OPTIONS: Priority[] = ['high', 'medium', 'low'];

/** Lets the promoter confirm or change the suggested priority. */
@Component({
  selector: 'app-priority-review',
  template: `
    <form class="review" (submit)="save($event)">
      <fieldset>
        <legend>¿Qué prioridad asignas?</legend>
        <p class="hint">
          Sugerencia automática: <strong>{{ display(assessment().priority).label }}</strong>.
          La decisión final es tuya.
        </p>
        @for (option of options; track option) {
          <label class="option">
            <input
              type="radio"
              [name]="'priority-' + assessment().encounterId"
              [value]="option"
              [checked]="chosen() === option"
              (change)="chosen.set(option)"
            />
            <span aria-hidden="true">{{ display(option).icon }}</span>
            {{ display(option).label }}
          </label>
        }
      </fieldset>

      @if (needsReason()) {
        <label class="reason-label" [for]="'reason-' + assessment().encounterId">
          ¿Por qué bajas la prioridad sugerida?
        </label>
        <textarea
          rows="2"
          [id]="'reason-' + assessment().encounterId"
          [value]="reason()"
          (input)="onReason($event)"
        ></textarea>
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <div class="actions">
        <button type="button" class="secondary" (click)="closed.emit()">Cancelar</button>
        <button type="submit" [disabled]="saving()">
          {{ saving() ? 'Guardando...' : 'Confirmar prioridad' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .review {
      display: flex; flex-direction: column; gap: 0.6rem;
      margin-top: 0.5rem; padding: 1rem; border-radius: var(--radius); background: var(--color-bg);
    }
    fieldset { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; padding: 0; border: none; }
    legend { font-weight: 700; margin-bottom: 0.25rem; }
    .hint { margin: 0 0 0.25rem; color: var(--color-muted); font-size: 0.9rem; }
    .option {
      display: flex; align-items: center; gap: 0.6rem;
      min-height: var(--touch-target); padding: 0.5rem 0.75rem;
      border: 1px solid var(--color-border); border-radius: var(--radius);
      background: var(--color-surface); font-weight: 600; cursor: pointer;
    }
    .option input { width: 1.4rem; height: 1.4rem; min-height: auto; margin: 0; }
    .reason-label { font-weight: 600; }
    .error { margin: 0; color: var(--color-danger); font-weight: 600; }
    .actions { display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; }
    .secondary { background: var(--color-surface); color: var(--color-primary-dark); border: 1px solid var(--color-primary); }
  `,
})
export class PriorityReview {
  private readonly repository = inject(EncounterRepository);

  readonly assessment = input.required<TriageAssessment>();
  readonly closed = output<void>();

  readonly options = OPTIONS;
  readonly chosen = signal<Priority>('medium');
  readonly reason = signal('');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly needsReason = computed(() => isLowering(this.assessment().priority, this.chosen()));

  ngOnInit(): void {
    const current = this.assessment();
    this.chosen.set(current.finalPriority ?? current.priority);
    this.reason.set(current.reviewNote ?? '');
  }

  display(priority: Priority) {
    return PRIORITY_DISPLAY[priority];
  }

  onReason(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.needsReason() && this.reason().trim().length < 5) {
      this.error.set('Explica brevemente por qué bajas la prioridad (mínimo 5 caracteres).');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const current = this.assessment();
    try {
      await this.repository.reviewAssessment(
        current.encounterId,
        current.encounterVersion,
        this.chosen(),
        this.reason(),
      );
      this.closed.emit();
    } catch (error) {
      this.error.set(
        error instanceof Error && error.message === 'ASSESSMENT_OUTDATED'
          ? 'El registro cambió mientras revisabas. Ciérralo y vuelve a intentarlo.'
          : 'No se pudo guardar la revisión. Inténtalo de nuevo.',
      );
      this.saving.set(false);
    }
  }
}