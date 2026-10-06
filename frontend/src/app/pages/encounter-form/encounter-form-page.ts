import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EncounterRepository } from '../../core/db/encounter.repository';
import { Sex } from '../../core/db/models';
import { ALARM_SIGNS } from '../../core/triage/alarm-signs';

type FieldName = 'birthYear' | 'sex' | 'community' | 'symptoms' | 'consentGiven';

@Component({
  selector: 'app-encounter-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1>{{ isEdit ? 'Editar registro' : 'Nuevo registro' }}</h1>
    @if (patientCode(); as code) {
      <p class="muted">Paciente {{ code }}</p>
    }
    <p class="local-note">Los datos se guardan primero en este dispositivo, con o sin conexión.</p>

    <form [formGroup]="form" (ngSubmit)="save()" novalidate class="card form">
      <fieldset>
        <legend>Datos del paciente</legend>
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
          <p class="field-error">Ingresa un año válido. Solo se registran personas adultas (18 años o más).</p>
        }

        <label for="sex">Sexo</label>
        <select id="sex" formControlName="sex" [attr.aria-invalid]="invalid('sex')">
          <option value="" disabled>Selecciona una opción</option>
          <option value="female">Femenino</option>
          <option value="male">Masculino</option>
          <option value="other">Otro</option>
        </select>
        @if (invalid('sex')) {
          <p class="field-error">Selecciona una opción.</p>
        }

        <label for="community">Comunidad o vereda</label>
        <input id="community" formControlName="community" [attr.aria-invalid]="invalid('community')" />
        @if (invalid('community')) {
          <p class="field-error">Indica la comunidad o vereda (máximo 80 caracteres).</p>
        }
      </fieldset>

      <fieldset>
        <legend>Síntomas</legend>
        <label for="symptoms">Describe los síntomas con tus palabras</label>
        <textarea
          id="symptoms"
          rows="4"
          formControlName="symptoms"
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
          <label class="check">
            <input type="checkbox" [formControlName]="sign.key" />
            <span>{{ sign.label }}</span>
          </label>
        }
      </fieldset>

      <label class="check consent">
        <input type="checkbox" formControlName="consentGiven" />
        <span>El paciente fue informado y autoriza el registro de sus datos para su atención.</span>
      </label>
      @if (invalid('consentGiven')) {
        <p class="field-error">Se requiere la autorización del paciente para guardar el registro.</p>
      }

      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }

      <div class="actions">
        <a class="button secondary" routerLink="/patients">Cancelar</a>
        <button type="submit" [disabled]="saving()">
          {{ saving() ? 'Guardando...' : 'Guardar registro' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .muted { margin-top: -0.5rem; color: var(--color-muted); font-weight: 600; }
    .local-note { color: var(--color-muted); font-size: 0.95rem; }

    .form { display: flex; flex-direction: column; gap: 1.25rem; }
    fieldset { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; padding: 0; border: none; }
    legend { margin-bottom: 0.5rem; font-size: 1.1rem; font-weight: 700; }
    label { font-weight: 600; margin-top: 0.5rem; }
    .hint { margin: 0; color: var(--color-muted); font-size: 0.9rem; }

    .check {
      display: flex; align-items: flex-start; gap: 0.75rem;
      min-height: var(--touch-target); padding: 0.6rem 0.75rem;
      border: 1px solid var(--color-border); border-radius: var(--radius);
      font-weight: 500; cursor: pointer;
    }
    .check input { width: 1.5rem; height: 1.5rem; min-height: auto; margin: 0; flex-shrink: 0; }
    .consent { background: #f0f6f4; }

    [aria-invalid='true'] { border-color: var(--color-danger); }
    .field-error, .form-error { margin: 0; color: var(--color-danger); font-weight: 600; font-size: 0.95rem; }

    .actions { display: flex; gap: 0.75rem; justify-content: flex-end; flex-wrap: wrap; }
    .secondary { background: var(--color-surface); color: var(--color-primary-dark); border: 1px solid var(--color-primary); }
    .secondary:hover { background: var(--color-bg); }
  `,
})
export class EncounterFormPage {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(EncounterRepository);
  private readonly router = inject(Router);
  private readonly encounterId = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly isEdit = this.encounterId !== null;
  readonly alarmSigns = ALARM_SIGNS;
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
    if (this.encounterId) {
      void this.loadForEdit(this.encounterId);
    }
  }

  invalid(name: FieldName): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();

    try {
      if (this.encounterId) {
        await this.repository.updateEncounter(this.encounterId, {
          symptoms: value.symptoms,
          alarms: value.alarms,
        });
      } else {
        await this.repository.registerVisit({
          birthYear: value.birthYear!,
          sex: value.sex as Sex,
          community: value.community,
          symptoms: value.symptoms,
          alarms: value.alarms,
          consentGiven: value.consentGiven,
        });
      }
      await this.router.navigate(['/patients'], { state: { saved: true } });
    } catch {
      this.error.set('No se pudo guardar en el dispositivo. Verifica el espacio disponible e inténtalo de nuevo.');
      this.saving.set(false);
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
    // In this version only the clinical part of a visit can be edited
    for (const name of ['birthYear', 'sex', 'community', 'consentGiven'] as const) {
      this.form.controls[name].disable();
    }
  }
}
