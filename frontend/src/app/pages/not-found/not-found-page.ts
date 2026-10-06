import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <h1>Página no encontrada</h1>
    <section class="card">
      <p>La dirección que buscas no existe.</p>
      <a class="button" routerLink="/patients">Ir a pacientes</a>
    </section>
  `,
})
export class NotFoundPage {}
