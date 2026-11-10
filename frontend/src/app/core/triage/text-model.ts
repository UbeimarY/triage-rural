import { Evidence, Priority } from '../db/models';

/** Text settings exported with the model, so the browser splits words exactly like training. */
export interface FeatureSettings {
  negators: string[];
  clauseBreaks: string[];
  presenceVerbs: string[];
  negationScope: number;
  scopeFree: string[];
  charN: number;
  sublinearTf: boolean;
  norm: string;
}

/** The model exactly as exported by the backend repository (ml/train.py). */
export interface TextModelJson {
  version: string;
  classes: string[];
  highThreshold: number;
  temperature: number;
  unknownFallback: string;
  features: FeatureSettings;
  vocabulary: string[];
  idf: number[];
  coef: number[][];
  intercept: number[];
}

interface CompiledSettings {
  negators: Set<string>;
  clauseBreaks: Set<string>;
  presenceVerbs: Set<string>;
  scopeFree: Set<string>;
  negationScope: number;
  charN: number;
}

export interface TextModel extends TextModelJson {
  index: Map<string, number>;
  settings: CompiledSettings;
  fallback: Priority;
}

/** A word of the note: where it is, and whether the promoter wrote it as denied. */
export interface Token {
  text: string;
  negated: boolean;
  /** UTF-16 offsets into the text as typed, so the UI can highlight it. */
  start: number;
  end: number;
}

export interface TextPrediction {
  priority: Priority;
  /** Calibrated probability of each class. */
  probabilities: Record<Priority, number>;
  /** Words that pushed the decision the most: the short explanation. */
  topTerms: string[];
  /** Every content word with its weight toward the suggested priority. */
  evidence: Evidence[];
  /** False when no word of the note is known to the model: the suggestion is the safe default. */
  known: boolean;
}

const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

/**
 * Function words carry weight in the model but explain nothing to a person.
 * They are hidden from the explanation only; predictions are untouched.
 */
const NOT_EXPLANATORY = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'en',
  'con',
  'por',
  'para',
  'que',
  'se',
  'le',
  'lo',
  'un',
  'una',
  'al',
  'su',
  'es',
  'esta',
  'hace',
  'desde',
  'muy',
  'mas',
  'pero',
  'no',
  'ya',
  'tiene',
  'ha',
  'porque',
  'viene',
  'dice',
  // Amounts and times: they qualify a symptom but are not one.
  'mucho',
  'poco',
  'dos',
  'tres',
  'dia',
  'dias',
  'hoy',
  'ayer',
  'anoche',
  'semana',
  'semanas',
  'horas',
]);

const DENYING_PRONOUNS = new Set(['se', 'le', 'lo']);

export function compileModel(json: TextModelJson): TextModel {
  if (!PRIORITIES.includes(json.unknownFallback as Priority)) {
    throw new Error(`Unknown fallback priority: ${json.unknownFallback}`);
  }
  const { features } = json;
  return {
    ...json,
    index: new Map(json.vocabulary.map((term, i) => [term, i])),
    fallback: json.unknownFallback as Priority,
    settings: {
      negators: new Set(features.negators),
      clauseBreaks: new Set(features.clauseBreaks),
      presenceVerbs: new Set(features.presenceVerbs),
      scopeFree: new Set(features.scopeFree),
      negationScope: features.negationScope,
      charN: features.charN,
    },
  };
}

/**
 * Lowercase without accents, keeping one output unit per input unit so token
 * offsets point into the text as typed. Mirrors ml/features.py normalize().
 */
export function normalize(text: string): string {
  let out = '';
  for (const char of text) {
    const base = char.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
    const first = [...base][0] ?? ' ';
    // Python counts code points, JavaScript UTF-16 units: pad so offsets stay aligned.
    out += first.length > char.length ? ' '.repeat(char.length) : first.padEnd(char.length, ' ');
  }
  return out;
}

function denies(words: string[], i: number, settings: CompiledSettings): boolean {
  if (settings.negators.has(words[i])) return true;
  if (words[i] !== 'no' || i + 1 >= words.length) return false;
  const following = words[i + 1];
  if (settings.presenceVerbs.has(following)) return true;
  // "no se ha desmayado", "no le ha dado fiebre"
  return (
    DENYING_PRONOUNS.has(following) &&
    i + 2 < words.length &&
    settings.presenceVerbs.has(words[i + 2])
  );
}

/**
 * Words of 2+ letters with their denial mark. "sin", "niega", "nunca" always deny;
 * a plain "no" only before a verb of presence ("no tiene fiebre"), because in
 * "no puede hablar" it describes the symptom. A denial ends with the clause.
 */
export function tokenize(text: string, settings: CompiledSettings): Token[] {
  const matches = [...normalize(text).matchAll(/[a-z]+|[.,;:!?\n]/g)];
  const words = matches.map((match) => match[0]);
  const tokens: Token[] = [];
  let scope = 0;
  matches.forEach((match, i) => {
    const word = words[i];
    if (!/^[a-z]/.test(word) || settings.clauseBreaks.has(word)) {
      scope = 0;
      return;
    }
    if (denies(words, i, settings)) {
      scope = settings.negationScope;
      return;
    }
    if (word.length < 2) return;
    const start = match.index ?? 0;
    tokens.push({ text: word, negated: scope > 0, start, end: start + word.length });
    if (!settings.scopeFree.has(word)) scope = Math.max(0, scope - 1);
  });
  return tokens;
}

/** [feature, indexes of the tokens it comes from], in the order ml/features.py uses. */
export function features(tokens: Token[], settings: CompiledSettings): [string, number[]][] {
  const kept = tokens
    .map((token, i) => ({ token, i }))
    .filter(({ token }) => !(token.negated && settings.scopeFree.has(token.text)))
    .map(({ token, i }) => ({ word: (token.negated ? 'no_' : '') + token.text, i }));

  const out: [string, number[]][] = kept.map(({ word, i }) => [word, [i]]);
  for (let k = 1; k < kept.length; k++) {
    out.push([`${kept[k - 1].word} ${kept[k].word}`, [kept[k - 1].i, kept[k].i]]);
  }
  tokens.forEach((token, i) => {
    if (token.negated) return;
    const padded = `<${token.text}>`;
    for (let k = 0; k + settings.charN <= padded.length; k++) {
      out.push([`c:${padded.slice(k, k + settings.charN)}`, [i]]);
    }
  });
  return out;
}

export function analyze(model: TextModel, text: string): string[] {
  return features(tokenize(text, model.settings), model.settings).map(([feature]) => feature);
}

export function predict(model: TextModel, text: string): TextPrediction {
  const tokens = tokenize(text, model.settings);

  // Sparse TF-IDF vector, remembering which tokens produced each known feature.
  const sources = new Map<number, number[][]>();
  for (const [feature, from] of features(tokens, model.settings)) {
    const i = model.index.get(feature);
    if (i === undefined) continue;
    const list = sources.get(i) ?? [];
    list.push(from);
    sources.set(i, list);
  }
  const x = new Map<number, number>();
  let squares = 0;
  for (const [i, list] of sources) {
    const weight = (1 + Math.log(list.length)) * model.idf[i]; // sublinear TF times IDF
    x.set(i, weight);
    squares += weight * weight;
  }
  const norm = Math.sqrt(squares) || 1;
  for (const [i, weight] of x) x.set(i, weight / norm);

  // Logistic regression with temperature: calibrated probabilities.
  const logits = model.coef.map(
    (row, c) => model.intercept[c] + [...x].reduce((sum, [i, value]) => sum + row[i] * value, 0),
  );
  const calibrated = softmax(logits, model.temperature);
  const probabilities = Object.fromEntries(
    model.classes.map((name, c) => [name, calibrated[c]]),
  ) as Record<Priority, number>;

  const known = x.size > 0;
  const priority = known ? decide(probabilities, model.highThreshold) : model.fallback;
  const evidence = explain(model, tokens, sources, x, model.classes.indexOf(priority));
  const topTerms = [
    ...new Set(
      evidence
        .filter((item) => !item.negated && item.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .map((item) => text.slice(item.start, item.end).toLowerCase()),
    ),
  ].slice(0, 3);

  return { priority, probabilities, topTerms, evidence, known };
}

/**
 * Weight of each word toward the chosen class: every feature's share of the logit,
 * relative to the average class (softmax only sees differences), split among the
 * words it came from.
 */
function explain(
  model: TextModel,
  tokens: Token[],
  sources: Map<number, number[][]>,
  x: Map<number, number>,
  chosen: number,
): Evidence[] {
  const weights = new Array<number>(tokens.length).fill(0);
  for (const [i, list] of sources) {
    const mean = model.coef.reduce((sum, row) => sum + row[i], 0) / model.coef.length;
    const share = ((model.coef[chosen][i] - mean) * x.get(i)!) / list.length;
    for (const from of list) for (const t of from) weights[t] += share / from.length;
  }
  return tokens.flatMap((token, t) =>
    NOT_EXPLANATORY.has(token.text)
      ? []
      : [
          {
            start: token.start,
            end: token.end,
            negated: token.negated,
            weight: Math.round(weights[t] * 1000) / 1000,
          },
        ],
  );
}

function softmax(logits: number[], temperature: number): number[] {
  const scaled = logits.map((logit) => logit / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

/**
 * Missing an urgent case is worse than a false alarm: "high" wins as soon as its
 * probability reaches the threshold chosen in training for high recall.
 */
export function decide(probabilities: Record<Priority, number>, highThreshold: number): Priority {
  if (probabilities.high >= highThreshold) return 'high';
  return probabilities.medium >= probabilities.low ? 'medium' : 'low';
}
