import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  Column,
  Insights,
  readableMinutes,
  SERIES,
  SERIES_LABEL,
  Series,
  stackColumns,
  total,
} from './insights';

const HEIGHT = 150;

/** Trend, agreement with the AI and sync delay for the selected period. */
@Component({
  selector: 'app-insights-panel',
  imports: [DatePipe],
  template: `
    <section class="card trend" aria-labelledby="trend-title">
      <div class="trend__head">
        <h2 id="trend-title">Visitas por día</h2>
        <ul class="legend">
          @for (series of series; track series) {
            <li><span class="swatch" [attr.data-series]="series"></span>{{ label(series) }}</li>
          }
        </ul>
      </div>

      <div class="plot" #plot (mouseleave)="hovered.set(null)">
        <svg
          [attr.viewBox]="'0 0 ' + width() + ' ' + (height + 22)"
          [attr.width]="width()"
          [attr.height]="height + 22"
          role="img"
          [attr.aria-label]="summary()"
        >
          <defs>
            <pattern
              id="unclassified-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="#d5dcd9" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#8d9893" stroke-width="2" />
            </pattern>
          </defs>
          <line class="baseline" x1="0" [attr.x2]="width()" [attr.y1]="height" [attr.y2]="height" />
          @for (column of chart().columns; track column.day; let i = $index) {
            <g
              class="column"
              [class.dim]="hovered() !== null && hovered() !== i"
              tabindex="0"
              (mouseenter)="hovered.set(i)"
              (focus)="hovered.set(i)"
              (blur)="hovered.set(null)"
              [attr.aria-label]="describe(column)"
            >
              <rect
                class="hit"
                [attr.x]="column.x - 6"
                y="0"
                [attr.width]="chart().barWidth + 12"
                [attr.height]="height"
              />
              @for (segment of column.segments; track segment.series; let top = $last) {
                <path
                  [attr.data-series]="segment.series"
                  [attr.d]="bar(column.x, segment.y, chart().barWidth, segment.height, top)"
                />
              }
              @if ((data().daily.length - 1 - i) % labelEvery() === 0) {
                <text
                  class="tick"
                  [attr.x]="column.x + chart().barWidth / 2"
                  [attr.y]="height + 16"
                >
                  {{ column.day | date: 'd MMM' : 'UTC' }}
                </text>
              }
              @if (i === busiest() && column.total > 0) {
                <text
                  class="peak"
                  [attr.x]="column.x + chart().barWidth / 2"
                  [attr.y]="height - (column.total / chart().max) * height - 6"
                >
                  {{ column.total }}
                </text>
              }
            </g>
          }
        </svg>
        @if (hoveredColumn(); as column) {
          <div class="tip" role="status" [style.left.px]="tipLeft(column)">
            <strong>{{ column.day | date: "EEEE d 'de' MMM" : 'UTC' }}</strong>
            <span>{{ column.total }} visitas</span>
            @for (series of series; track series) {
              @if (count(column.day, series) > 0) {
                <span
                  ><i class="swatch" [attr.data-series]="series"></i>{{ label(series) }}:
                  {{ count(column.day, series) }}</span
                >
              }
            }
          </div>
        }
      </div>

      <details>
        <summary>Ver como tabla</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Día</th>
              @for (series of series; track series) {
                <th scope="col">{{ label(series) }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (day of data().daily; track day.day) {
              <tr>
                <th scope="row">{{ day.day | date: 'd MMM' : 'UTC' }}</th>
                @for (series of series; track series) {
                  <td>{{ day[series] }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </details>
    </section>

    <section class="card" aria-labelledby="agreement-title">
      <h2 id="agreement-title">¿Los promotores mantienen la sugerencia de la IA?</h2>
      @if (data().agreement; as a) {
        @if (a.reviewed === 0) {
          <p class="muted">Aún no hay sugerencias de la IA revisadas en este periodo.</p>
        } @else {
          <p class="headline">
            <span class="big">{{ percent(a.kept, a.reviewed) }} %</span>
            de {{ a.reviewed }} sugerencias revisadas se mantuvieron
          </p>
          <p class="split">
            <span>▲ {{ a.raised }} subidas</span>
            <span>▼ {{ a.lowered }} bajadas (siempre con motivo escrito)</span>
          </p>
          <table class="matrix">
            <caption>
              Sugerencia de la IA (filas) frente a la decisión del promotor (columnas)
            </caption>
            <thead>
              <tr>
                <td></td>
                @for (p of priorities; track p) {
                  <th scope="col">{{ priorityLabel(p) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (s of priorities; track s) {
                <tr>
                  <th scope="row">{{ priorityLabel(s) }}</th>
                  @for (f of priorities; track f) {
                    <td [class.diagonal]="s === f" [class.empty]="cell(s, f) === 0">
                      {{ cell(s, f) }}
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </section>

    <section class="card" aria-labelledby="delay-title">
      <h2 id="delay-title">Del registro al servidor</h2>
      @if (data().syncDelay.visits === 0) {
        <p class="muted">Sin visitas sincronizadas en este periodo.</p>
      } @else {
        <p class="headline">
          La mitad de las visitas llega en
          <span class="big block">{{ minutes(data().syncDelay.medianMinutes) }}</span>
        </p>
        <p class="muted">
          9 de cada 10 llegan en {{ minutes(data().syncDelay.p90Minutes) }}: lo que tarda un
          promotor en volver a tener señal.
        </p>
      }
    </section>

    @if (data().byPromoter.length > 0) {
      <section class="card" aria-labelledby="promoters-title">
        <h2 id="promoters-title">Visitas por promotor</h2>
        <ul class="promoters">
          @for (row of data().byPromoter; track row.promoterName) {
            <li>
              <span>{{ row.promoterName }}</span>
              <span class="num">{{ row.visits }}</span>
              <span class="num high">▲ {{ row.high }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.75rem;
    }
    /* Wide screens: the trend across the top, the three readings side by side. */
    @media (min-width: 1000px) {
      :host {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: start;
      }
      .trend {
        grid-column: 1 / -1;
      }
    }
    h2 {
      font-size: 1.05rem;
      margin-bottom: 0.5rem;
    }
    .trend__head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.25rem 1rem;
      align-items: baseline;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 0.75rem;
      margin: 0 0 0.5rem;
      padding: 0;
      list-style: none;
      font-size: 0.85rem;
      color: var(--color-muted);
    }
    .legend li {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .swatch {
      display: inline-block;
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 3px;
      margin-right: 0.3rem;
      vertical-align: -1px;
    }
    .legend .swatch {
      margin: 0;
    }
    [data-series='high'] {
      background: #c0392b;
      fill: #c0392b;
    }
    [data-series='medium'] {
      background: #d99a2b;
      fill: #d99a2b;
    }
    [data-series='low'] {
      background: #3f8f5f;
      fill: #3f8f5f;
    }
    [data-series='unclassified'] {
      background: repeating-linear-gradient(45deg, #d5dcd9 0 3px, #8d9893 3px 5px);
      fill: url(#unclassified-hatch);
    }
    .plot {
      position: relative;
      margin-top: 1rem; /* room for the busiest day's number */
    }
    svg {
      display: block;
      max-width: 100%;
      overflow: visible;
    }
    .baseline {
      stroke: var(--color-border);
      stroke-width: 1;
    }
    .hit {
      fill: transparent;
    }
    .column {
      outline: none;
      transition: opacity 120ms;
    }
    .column.dim {
      opacity: 0.45;
    }
    .column:focus-visible .hit {
      stroke: var(--color-focus);
      stroke-width: 2;
    }
    .tick,
    .peak {
      font-size: 12px;
      text-anchor: middle;
      fill: var(--color-muted);
    }
    .peak {
      font-size: 12px;
      font-weight: 700;
      fill: var(--color-text);
    }
    .tip {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 9rem;
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-surface);
      box-shadow: var(--shadow);
      font-size: 0.85rem;
      pointer-events: none;
      white-space: nowrap;
    }
    .tip strong::first-letter {
      text-transform: uppercase;
    }
    details {
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }
    summary {
      cursor: pointer;
      color: var(--color-primary-dark);
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0.5rem;
      font-variant-numeric: tabular-nums;
    }
    th,
    td {
      padding: 0.3rem 0.4rem;
      text-align: right;
      border-bottom: 1px solid var(--color-border);
    }
    th[scope='row'],
    caption {
      text-align: left;
    }
    caption {
      font-size: 0.8rem;
      color: var(--color-muted);
      padding-bottom: 0.3rem;
    }
    .headline {
      margin: 0;
      font-weight: 600;
    }
    .big {
      font-size: 1.8rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .big.block {
      display: block;
    }
    .split {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
      margin: 0.25rem 0 0;
      color: var(--color-muted);
      font-size: 0.9rem;
    }
    .matrix td.diagonal {
      font-weight: 700;
      background: var(--priority-low-bg);
    }
    .matrix td.empty {
      color: var(--color-border);
    }
    .muted {
      margin: 0;
      color: var(--color-muted);
    }
    .promoters {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .promoters li {
      display: grid;
      grid-template-columns: 1fr 3rem 3.5rem;
      gap: 0.5rem;
      padding: 0.35rem 0;
      border-bottom: 1px solid var(--color-border);
    }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .high {
      color: var(--priority-high);
    }
  `,
})
export class InsightsPanel {
  readonly data = input.required<Insights>();

  /** Drawn in real pixels, so bars stay thin and labels stay legible at any width. */
  protected readonly width = signal(640);
  protected readonly height = HEIGHT;
  private readonly plot = viewChild<ElementRef<HTMLElement>>('plot');
  protected readonly series = SERIES;
  protected readonly priorities = ['high', 'medium', 'low'] as const;
  protected readonly hovered = signal<number | null>(null);

  protected readonly chart = computed(() => stackColumns(this.data().daily, this.width(), HEIGHT));

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.plot()?.nativeElement;
      if (!element || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) =>
        this.width.set(Math.max(240, Math.round(entry.contentRect.width))),
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Keeps the tooltip inside the card near both edges. */
  protected tipLeft(column: Column): number {
    const center = column.x + this.chart().barWidth / 2;
    return Math.min(Math.max(center, 80), this.width() - 80);
  }
  protected readonly hoveredColumn = computed(() => {
    const i = this.hovered();
    return i === null ? null : (this.chart().columns[i] ?? null);
  });
  /** Only the busiest day carries a number: the axis and the tooltip carry the rest. */
  protected readonly busiest = computed(() => {
    const totals = this.data().daily.map(total);
    return totals.indexOf(Math.max(...totals));
  });
  /** Counted back from today, so the latest day always has its date. */
  protected readonly labelEvery = computed(() =>
    Math.ceil(this.data().daily.length / Math.max(2, Math.floor(this.width() / 72))),
  );
  protected readonly summary = computed(() => {
    const visits = this.data().daily.reduce((sum, day) => sum + total(day), 0);
    const high = this.data().daily.reduce((sum, day) => sum + day.high, 0);
    return `${visits} visitas en ${this.data().days} días, ${high} de prioridad alta. La tabla tiene el detalle por día.`;
  });

  protected label(series: Series): string {
    return SERIES_LABEL[series];
  }

  protected priorityLabel(priority: 'high' | 'medium' | 'low'): string {
    return SERIES_LABEL[priority];
  }

  protected count(day: string, series: Series): number {
    return this.data().daily.find((d) => d.day === day)?.[series] ?? 0;
  }

  protected describe(column: Column): string {
    const parts = SERIES.filter((s) => this.count(column.day, s) > 0).map(
      (s) => `${this.count(column.day, s)} ${SERIES_LABEL[s].toLowerCase()}`,
    );
    return `${column.day}: ${column.total} visitas${parts.length ? ', ' + parts.join(', ') : ''}`;
  }

  protected cell(suggested: string, final: string): number {
    return (
      this.data().agreement.cells.find((c) => c.suggested === suggested && c.final === final)
        ?.visits ?? 0
    );
  }

  protected percent(part: number, whole: number): number {
    return whole === 0 ? 0 : Math.round((part / whole) * 100);
  }

  protected minutes(value: number | null): string {
    return readableMinutes(value);
  }

  /** A column segment; the top one gets 4-unit rounded corners, the baseline stays square. */
  protected bar(x: number, y: number, w: number, h: number, roundTop: boolean): string {
    const r = roundTop ? Math.min(4, h, w / 2) : 0;
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }
}
