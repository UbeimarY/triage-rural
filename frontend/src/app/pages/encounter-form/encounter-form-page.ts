import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, map, merge } from 'rxjs';
import { EncounterRepository } from '../../core/db/encounter.repository';
import { AlarmAnswers, Sex, TriageResult } from '../../core/db/models';
import { ALARM_SIGNS } from '../../core/triage/alarm-signs';
import { DETAIL_PROMPTS, explainResult, needsMoreDetail } from '../../core/triage/explain';
import { TriageRunner } from '../../core/triage/triage-runner.service';
import { TriageService } from '../../core/triage/triage.service';
import { NoteHighlight } from '../../shared/note-highlight';
import { PriorityBadge } from '../../shared/priority-badge';

type FieldName = 'birthYear' | 'sex' | 'community' | 'symptoms' | 'consentGiven';

/** The fields each step validates before moving on. */
const STEP_FIELDS: readonly (readonly FieldName[])[] = [
  ['birthYear', 'sex', 'community'],
  ['symptoms'],
  ['consentGiven'],
];

@Component({
  selector: 'app-encounter-form-page',
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, PriorityBadge, NoteHighlight],
  template: `
    <h1>{{ isEdit ? 'Editar registro' : 'Nuevo registro' }}</h1>
    @if (patientCode(); as code) {
      <p class="muted">Paciente {{ code }}</p>
    }

    <ol class="steps" aria-label="Pasos del registro">
      @for (name of stepNames; track $index) {
        <li
          [class.done]="$index < step()"
          [class.current]="$index === step()"
          [attr.aria-current]="$index === step() ? 'step' : null"
        >
          <span class="steps__dot" aria-hidden="true">{{
            $index < step() ? '✓' : $index + 1
          }}</span>
          <span>{{ name }}</span>
        </li>
      }
    </ol>

    <form [formGroup]="form" (ngSubmit)="save()" novalidate class="card form">
      <h2 id="step-title" class="step-title" tabindex="-1">
        Paso {{ step() + 1 }} de 3 · {{ stepNames[step()] }}
      </h2>

      @switch (step()) {
        @case (0) {
          <fieldset>
            <legend class="visually-hidden">Datos del paciente</legend>
            <p class="hint">Registra solo datos mínimos: sin nombres, documentos ni teléfonos.</p>

            <label for="birthYear">Año de nacimiento</label>
            <input
              id="birthYear"
              type="number"
              inputmode="numeric"
              formControlName="birthYear"
              [attr.aria-invalid]="invalid('birthYear')"
            />
            @if (invalid('birthYear')) {
              <p class="field-error">
                Ingresa un año válido. Solo se registran personas adultas (18 años o más).
              </p>
            }

            <span class="label" id="sex-label">Sexo</span>
            <div class="choices" role="radiogroup" aria-labelledby="sex-label">
              @for (option of sexOptions; track option.value) {
                <label class="choice">
                  <input type="radio" formControlName="sex" [value]="option.value" />
                  <span>{{ option.label }}</span>
                </label>
              }
            </div>
            @if (invalid('sex')) {
              <p class="field-error">Selecciona una opción.</p>
            }

            <label for="community">Comunidad o vereda</label>
            <input
              id="community"
              formControlName="community"
              list="communities"
              autocomplete="off"
              [attr.aria-invalid]="invalid('community')"
            />
            <datalist id="communities">
              @for (name of knownCommunities(); track name) {
                <option [value]="name"></option>
              }
            </datalist>
            @if (invalid('community')) {
              <p class="field-error">Indica la comunidad o vereda (máximo 80 caracteres).</p>
            }
          </fieldset>
        }

        @case (1) {
          <fieldset>
            <legend class="visually-hidden">Síntomas</legend>
            <label for="symptoms">Describe los síntomas con tus palabras</label>
            <p class="hint" id="symptoms-hint">
              Escribe también lo que <em>no</em> tiene: «sin fiebre», «niega dolor de pecho».
            </p>
            <textarea
              id="symptoms"
              rows="4"
              formControlName="symptoms"
              aria-describedby="symptoms-hint"
              [attr.aria-invalid]="invalid('symptoms')"
            ></textarea>
            @if (invalid('symptoms')) {
              <p class="field-error">Describe los síntomas (entre 10 y 1000 caracteres).</p>
            }
          </fieldset>

          <fieldset formGroupName="alarms">
            <legend>Signos de alarma</legend>
            <p class="hint">Marca solo lo que el paciente presenta ahora.</p>
            @for (sign of alarmSigns; track sign.key) {
              <label class="check" [class.checked]="form.controls.alarms.controls[sign.key].value">
                <input type="checkbox" [formControlName]="sign.key" />
                <span>{{ sign.label }}</span>
              </label>
            }
          </fieldset>

          <ng-container *ngTemplateOutlet="previewBlock" />
        }

        @case (2) {
          <dl class="summary">
            @if (!isEdit) {
              <div>
                <dt>Paciente</dt>
                <dd>{{ patientLine() }}</dd>
              </div>
            }
            <div>
              <dt>Signos de alarma</dt>
              <dd>{{ alarmLine() }}</dd>
            </div>
          </dl>

          <ng-container *ngTemplateOutlet="previewBlock" />

          <label class="check consent">
            <input type="checkbox" formControlName="consentGiven" />
            <span
              >El paciente fue informado y autoriza el registro de sus datos para su atención.</span
            >
          </label>
          @if (invalid('consentGiven')) {
            <p class="field-error">
              Se requiere la autorización del paciente para guardar el registro.
            </p>
          }
        }
      }

      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }

      <div class="actions">
        @if (step() > firstStep) {
          <button type="button" class="secondary" (click)="back()">Atrás</button>
        } @else {
          <a class="button secondary" routerLink="/today">Cancelar</a>
        }
        @if (step() < 2) {
          <button type="button" (click)="next()">Siguiente</button>
        } @else {
          <button type="submit" [disabled]="saving()">
            {{ saving() ? 'Guardando…' : 'Guardar registro' }}
          </button>
        }
      </div>
    </form>

    <ng-template #previewBlock>
      <section
        class="preview"
        aria-labelledby="preview-title"
        [attr.data-priority]="preview()?.priority"
      >
        <h2 id="preview-title">Prioridad sugerida</h2>
        <div aria-live="polite">
          @if (preview(); as result) {
            <app-priority-badge [priority]="result.priority" />
            <p class="preview-reason">{{ explain(result) }}</p>

            @if (result.source === 'model' && result.evidence?.length) {
              <figure class="reading">
                <figcaption>Así leyó la IA tu nota</figcaption>
                <app-note-highlight [text]="previewText()" [result]="result" [legend]="true" />
              </figure>
            }

            @for (key of pendingFollowUps(); track key) {
              <div class="follow-up" role="group" [attr.aria-label]="labelFor(key)">
                <p>
                  La nota menciona algo de <strong>{{ shortLabelFor(key) }}</strong
                  >.
                  {{ labelFor(key) }}
                </p>
                <div class="follow-up-actions">
                  <button type="button" (click)="markAlarm(key)">Sí, marcar</button>
                  <button type="button" class="secondary" (click)="dismissFollowUp(key)">
                    No lo presenta
                  </button>
                </div>
              </div>
            }

            @if (moreDetail(result)) {
              <div class="detail">
                <p>Para afinar la sugerencia, agrega a la nota:</p>
                <ul>
                  @for (prompt of detailPrompts; track prompt) {
                    <li>{{ prompt }}</li>
                  }
                </ul>
              </div>
            }
          } @else {
            <p class="hint">
              Escribe los síntomas o marca un signo de alarma y aquí verás la sugerencia.
            </p>
          }
        </div>
        <p class="hint">
          Se calcula en este teléfono, aun sin internet. Después de guardar puedes confirmarla o
          cambiarla.
        </p>
      </section>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      max-width: 720px;
      margin: 0 auto;
    }
    .muted {
      margin-top: -0.5rem;
      color: var(--color-muted);
      font-weight: 600;
    }
    .local-note {
      color: var(--color-muted);
      font-size: 0.95rem;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.4rem;
      margin: 0 0 1rem;
      padding: 0;
      list-style: none;
      counter-reset: none;
    }
    .steps li {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding-top: 0.5rem;
      border-top: 4px solid var(--color-border);
      color: var(--color-muted);
      font-size: 0.85rem;
      font-weight: 600;
    }
    .steps li.done {
      border-top-color: var(--color-primary);
    }
    .steps li.current {
      border-top-color: var(--color-primary-dark);
      color: var(--color-text);
    }
    .steps__dot {
      display: grid;
      place-items: center;
      width: 1.7rem;
      height: 1.7rem;
      border-radius: 50%;
      border: 2px solid currentColor;
      font-size: 0.85rem;
    }
    .steps li.done .steps__dot,
    .steps li.current .steps__dot {
      border-color: var(--color-primary-dark);
      background: var(--color-primary-dark);
      color: #fff;
    }
    .step-title {
      margin: 0;
      font-size: 1.15rem;
    }
    .step-title:focus {
      outline: none;
    }
    .label {
      font-weight: 600;
      margin-top: 0.5rem;
    }
    .choices {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.5rem;
    }
    .choice {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: var(--touch-target);
      margin: 0;
      padding: 0.5rem;
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius);
      cursor: pointer;
    }
    .choice input {
      width: 1.2rem;
      height: 1.2rem;
      min-height: auto;
      margin: 0;
      accent-color: var(--color-primary-dark);
    }
    .choice:has(input:checked),
    .check.checked {
      border-color: var(--color-primary-dark);
      box-shadow: inset 0 0 0 1px var(--color-primary-dark);
      background: #eef6f3;
    }
    .check.checked {
      border-color: var(--priority-high);
      box-shadow: inset 0 0 0 1px var(--priority-high);
      background: var(--priority-high-bg);
    }
    .summary {
      display: grid;
      gap: 0.6rem;
      margin: 0;
    }
    .summary dt {
      font-size: 0.85rem;
      color: var(--color-muted);
      font-weight: 700;
    }
    .summary dd {
      margin: 0;
      font-weight: 600;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    fieldset {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin: 0;
      padding: 0;
      border: none;
    }
    legend {
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
      font-weight: 700;
    }
    label {
      font-weight: 600;
      margin-top: 0.5rem;
    }
    .hint {
      margin: 0;
      color: var(--color-muted);
      font-size: 0.9rem;
    }

    .check {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      min-height: var(--touch-target);
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      font-weight: 500;
      cursor: pointer;
    }
    .check input {
      width: 1.5rem;
      height: 1.5rem;
      min-height: auto;
      margin: 0;
      flex-shrink: 0;
    }
    .consent {
      background: #f0f6f4;
    }

    [aria-invalid='true'] {
      border-color: var(--color-danger);
    }
    .field-error,
    .form-error {
      margin: 0;
      color: var(--color-danger);
      font-weight: 600;
      font-size: 0.95rem;
    }

    .preview {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      border-radius: var(--radius);
      border: 2px dashed var(--color-border);
      background: var(--color-bg);
    }
    .preview h2 {
      margin: 0;
      font-size: 1rem;
    }
    .preview-reason {
      margin: 0.4rem 0 0;
      font-weight: 600;
    }
    .preview[data-priority='high'] {
      border-style: solid;
      border-color: var(--priority-high);
      background: var(--priority-high-bg);
    }
    .preview[data-priority='medium'] {
      border-style: solid;
      border-color: #d9a54a;
      background: var(--priority-medium-bg);
    }
    .preview[data-priority='low'] {
      border-style: solid;
      border-color: #6fb589;
      background: var(--priority-low-bg);
    }

    .reading {
      margin: 0.5rem 0 0;
      padding: 0.75rem;
      border-radius: var(--radius);
      background: var(--color-surface);
    }
    .reading figcaption {
      margin-bottom: 0.35rem;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-muted);
    }
    .follow-up,
    .detail {
      margin-top: 0.5rem;
      padding: 0.75rem;
      border-radius: var(--radius);
      border-left: 4px solid var(--priority-high);
      background: var(--color-surface);
    }
    .detail {
      border-left-color: var(--color-primary);
    }
    .follow-up p,
    .detail p {
      margin: 0;
    }
    .detail ul {
      margin: 0.35rem 0 0;
      padding-left: 1.25rem;
    }
    .follow-up-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .secondary {
      background: var(--color-surface);
      color: var(--color-primary-dark);
      border: 1px solid var(--color-primary);
    }
    .secondary:hover {
      background: var(--color-bg);
    }
  `,
})
export class EncounterFormPage {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(EncounterRepository);
  private readonly router = inject(Router);
  private readonly triageRunner = inject(TriageRunner);
  private readonly triage = inject(TriageService);
  private readonly encounterId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  /** Live suggestion while typing; the saved result is computed again after saving. */
  readonly preview = signal<TriageResult | null>(null);
  readonly explain = explainResult;
  readonly moreDetail = needsMoreDetail;
  readonly detailPrompts = DETAIL_PROMPTS;
  /** The note exactly as the preview evaluated it: highlights point into this text. */
  readonly previewText = signal('');
  /** Follow-up questions the promoter answered "no" to, so they are not asked again. */
  private readonly dismissed = signal<ReadonlySet<keyof AlarmAnswers>>(new Set());
  readonly pendingFollowUps = computed(() =>
    (this.preview()?.followUps ?? []).filter((key) => !this.dismissed().has(key)),
  );
  private previewRun = 0;

  readonly isEdit = this.encounterId !== null;
  readonly alarmSigns = ALARM_SIGNS;
  readonly stepNames = ['Paciente', 'Síntomas', 'Confirmar'] as const;
  readonly sexOptions: { value: Sex; label: string }[] = [
    { value: 'female', label: 'Femenino' },
    { value: 'male', label: 'Masculino' },
    { value: 'other', label: 'Otro' },
  ];
  /** Editing changes only the clinical part, so it starts at the symptoms. */
  readonly firstStep = this.isEdit ? 1 : 0;
  readonly step = signal(this.firstStep);
  /** Communities already typed on this phone, offered as suggestions. */
  readonly knownCommunities = toSignal(
    this.repository
      .watchVisits()
      .pipe(map((visits) => [...new Set(visits.map((v) => v.patient.community))].sort())),
    { initialValue: [] as string[] },
  );
  readonly currentYear = new Date().getFullYear();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly patientCode = signal<string | null>(null);

  readonly form = this.fb.group({
    birthYear: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1900),
      Validators.max(this.currentYear - 18),
    ]),
    sex: this.fb.nonNullable.control<Sex | ''>('', Validators.required),
    community: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(80)]),
    symptoms: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(10),
      Validators.maxLength(1000),
    ]),
    alarms: this.fb.nonNullable.group({
      breathingDifficulty: false,
      lossOfConsciousness: false,
      chestPain: false,
      severeBleeding: false,
      seizures: false,
    }),
    consentGiven: this.fb.nonNullable.control(false, Validators.requiredTrue),
  });

  constructor() {
    // Re-evaluate shortly after the promoter stops typing or ticks an alarm sign.
    merge(this.form.controls.symptoms.valueChanges, this.form.controls.alarms.valueChanges)
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => void this.updatePreview());

    if (this.encounterId) {
      void this.loadForEdit(this.encounterId);
    }
  }

  invalid(name: FieldName): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  /** Moves on only when this step's answers are valid; errors show where they are. */
  next(): void {
    const fields = STEP_FIELDS[this.step()];
    if (fields.some((name) => this.form.controls[name].invalid)) {
      fields.forEach((name) => this.form.controls[name].markAsTouched());
      this.error.set('Revisa los campos marcados.');
      return;
    }
    this.error.set(null);
    this.goTo(this.step() + 1);
  }

  back(): void {
    this.error.set(null);
    this.goTo(Math.max(this.firstStep, this.step() - 1));
  }

  patientLine(): string {
    const { birthYear, sex, community } = this.form.getRawValue();
    const sexLabel = this.sexOptions.find((o) => o.value === sex)?.label ?? '';
    const age = birthYear ? `≈ ${this.currentYear - birthYear} años` : '';
    return [age, sexLabel, community].filter(Boolean).join(' · ');
  }

  alarmLine(): string {
    const { alarms } = this.form.getRawValue();
    const marked = ALARM_SIGNS.filter((sign) => alarms[sign.key]).map((sign) => sign.shortLabel);
    return marked.length ? marked.join(', ') : 'Ninguno marcado';
  }

  private goTo(step: number): void {
    this.step.set(step);
    // Screen readers and keyboards land on the new step, not on a button that vanished.
    setTimeout(() => document.getElementById('step-title')?.focus());
  }

  labelFor(key: keyof AlarmAnswers): string {
    return ALARM_SIGNS.find((sign) => sign.key === key)?.label ?? key;
  }

  shortLabelFor(key: keyof AlarmAnswers): string {
    return ALARM_SIGNS.find((sign) => sign.key === key)?.shortLabel ?? key;
  }

  /** The promoter confirms the alarm: the rule then decides, as with any marked sign. */
  markAlarm(key: keyof AlarmAnswers): void {
    this.form.controls.alarms.controls[key].setValue(true);
  }

  dismissFollowUp(key: keyof AlarmAnswers): void {
    this.dismissed.update((keys) => new Set([...keys, key]));
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      const broken = STEP_FIELDS.findIndex((fields) =>
        fields.some((name) => this.form.controls[name].invalid),
      );
      if (broken >= 0 && broken !== this.step()) this.goTo(broken);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();

    try {
      const encounter = this.encounterId
        ? await this.repository.updateEncounter(this.encounterId, {
            symptoms: value.symptoms,
            alarms: value.alarms,
          })
        : (
            await this.repository.registerVisit({
              birthYear: value.birthYear!,
              sex: value.sex as Sex,
              community: value.community,
              symptoms: value.symptoms,
              alarms: value.alarms,
              consentGiven: value.consentGiven,
            })
          ).encounter;

      // Classification runs in the background: we navigate immediately, without waiting for it
      this.triageRunner.run(encounter);
      await this.router.navigate(['/patients'], { state: { saved: true } });
    } catch {
      this.error.set(
        'No se pudo guardar en el dispositivo. Verifica el espacio disponible e inténtalo de nuevo.',
      );
      this.saving.set(false);
    }
  }

  private async updatePreview(): Promise<void> {
    const { symptoms, alarms } = this.form.getRawValue();
    const anyAlarm = Object.values(alarms).some(Boolean);
    if (symptoms.trim().length < 10 && !anyAlarm) {
      this.preview.set(null);
      return;
    }
    // Only the newest request may update the preview, even if an older one answers later.
    const run = ++this.previewRun;
    try {
      const result = await this.triage.classify({ symptoms, alarms });
      if (run === this.previewRun) {
        this.previewText.set(symptoms);
        this.preview.set(result);
      }
    } catch {
      if (run === this.previewRun) this.preview.set(null);
    }
  }

  private async loadForEdit(id: string): Promise<void> {
    const visit = await this.repository.getVisit(id);
    if (!visit) {
      this.error.set('No se encontró el registro.');
      return;
    }
    this.patientCode.set(visit.patient.code);
    this.form.patchValue({
      birthYear: visit.patient.birthYear,
      sex: visit.patient.sex,
      community: visit.patient.community,
      symptoms: visit.encounter.symptoms,
      alarms: visit.encounter.alarms,
      consentGiven: visit.encounter.consentGiven,
    });
    void this.updatePreview();
    // In this version only the clinical part of a visit can be edited
    for (const name of ['birthYear', 'sex', 'community', 'consentGiven'] as const) {
      this.form.controls[name].disable();
    }
  }
}
