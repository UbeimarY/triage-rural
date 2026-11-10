import { Component, computed, input } from '@angular/core';
import { TriageResult } from '../core/db/models';
import { noteSegments } from '../core/triage/explain';

/**
 * The symptoms note as the AI read it: words that weighed for the suggestion are
 * marked, words against it are tinted, findings written as absent are struck through.
 */
@Component({
  selector: 'app-note-highlight',
  // The note is rendered on one line on purpose: any whitespace between the
  // pieces would show up as extra spaces inside the patient's words.
  template: `<!-- prettier-ignore -->
    <p class="note">@for (s of segments(); track $index) {@switch (s.role) {@case ('for') {<mark class="for">{{ s.text }}</mark>}@case ('against') {<mark class="against">{{ s.text }}</mark>}@case ('denied') {<del class="denied">{{ s.text }}</del>}@default {{{ s.text }}}}}</p>
    @if (legend()) {
      <p class="legend" aria-hidden="true">
        <mark class="for">pesa a favor</mark>
        <mark class="against">pesa en contra</mark>
        <del class="denied">escrito como ausente</del>
      </p>
    }`,
  styles: `
    :host {
      display: block;
    }
    .note {
      margin: 0;
      line-height: 1.75;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    mark {
      padding: 0.05em 0.15em;
      border-radius: 3px;
      color: inherit;
    }
    .for {
      background: var(--evidence-for-bg);
      box-shadow: inset 0 -2px 0 var(--evidence-for);
    }
    .against {
      background: var(--evidence-against-bg);
      box-shadow: inset 0 -2px 0 var(--evidence-against);
    }
    .denied {
      text-decoration-thickness: 2px;
      color: var(--color-muted);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 1rem;
      margin: 0.5rem 0 0;
      font-size: 0.8rem;
    }
  `,
})
export class NoteHighlight {
  readonly text = input.required<string>();
  readonly result = input.required<TriageResult>();
  readonly legend = input(false);
  protected readonly segments = computed(() => noteSegments(this.text(), this.result()));
}
