import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-patients-page',
  imports: [RouterLink],
  template: `
    <h1>Pacientes</h1>
    <section class="card empty-state">
      <p>Aún no hay pacientes registrados.</p>
      <a class="button" routerLink="/encounters/new">Registrar el primero</a>
    </section>
  `,
  styles: `
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      text-align: center;
    }
  `,
})
export class PatientsPage {}