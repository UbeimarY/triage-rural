import { Priority } from '../db/models';

/** The model exactly as exported by the backend repository (ml/train.py). */
export interface TextModelJson {
  version: string;
  classes: string[];
  highThreshold: number;
  vocabulary: string[];
  idf: number[];
  coef: number[][];
  intercept: number[];
}

export interface TextModel extends TextModelJson {
  index: Map<string, number>;
}

export interface TextPrediction {
  priority: Priority;
  /** Probability of each class, from the logistic regression. */
  probabilities: Record<Priority, number>;
  /** Words that pushed the decision the most: shown to the promoter as the explanation. */
  topTerms: string[];
}

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
]);

function isExplanatory(term: string): boolean {
  return term.split(' ').some((word) => !NOT_EXPLANATORY.has(word));
}

export function compileModel(json: TextModelJson): TextModel {
  return { ...json, index: new Map(json.vocabulary.map((term, i) => [term, i])) };
}

/**
 * Same preprocessing as scikit-learn's TfidfVectorizer in training:
 * lowercase, strip accents (NFKD without combining marks), words of 2+ letters,
 * then unigrams followed by bigrams. Any difference here would silently change
 * predictions, so the equivalence test compares both implementations.
 */
export function analyze(text: string): string[] {
  const normalized = text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
  const tokens = normalized.match(/[a-z]{2,}/g) ?? [];
  const bigrams = tokens.slice(1).map((token, i) => `${tokens[i]} ${token}`);
  return [...tokens, ...bigrams];
}

export function predict(model: TextModel, text: string): TextPrediction {
  // Sparse TF-IDF vector: term index -> weight.
  const counts = new Map<number, number>();
  for (const term of analyze(text)) {
    const i = model.index.get(term);
    if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  const weights = new Map<number, number>();
  let squares = 0;
  for (const [i, count] of counts) {
    const weight = (1 + Math.log(count)) * model.idf[i]; // sublinear TF times IDF
    weights.set(i, weight);
    squares += weight * weight;
  }
  const norm = Math.sqrt(squares) || 1;

  // Logistic regression: one score per class, then softmax.
  const logits = model.coef.map(
    (row, c) =>
      model.intercept[c] + [...weights].reduce((sum, [i, w]) => sum + row[i] * (w / norm), 0),
  );
  const max = Math.max(...logits);
  const exps = logits.map((logit) => Math.exp(logit - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  const probabilities = Object.fromEntries(
    model.classes.map((name, c) => [name, exps[c] / total]),
  ) as Record<Priority, number>;

  const priority = decide(probabilities, model.highThreshold);
  const c = model.classes.indexOf(priority);
  const topTerms = [...weights]
    .map(([i, w]) => ({ term: model.vocabulary[i], contribution: model.coef[c][i] * (w / norm) }))
    .filter((item) => item.contribution > 0 && isExplanatory(item.term))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((item) => item.term);

  return { priority, probabilities, topTerms };
}

/**
 * Missing an urgent case is worse than a false alarm: "high" wins as soon as its
 * probability reaches the threshold chosen in training for high recall.
 */
export function decide(probabilities: Record<Priority, number>, highThreshold: number): Priority {
  if (probabilities.high >= highThreshold) return 'high';
  return probabilities.medium >= probabilities.low ? 'medium' : 'low';
}
