import { compileModel } from '../text-model';
import modelJson from './triage-text-v1.json';

/**
 * The trained model ships inside the JavaScript bundle, so the service worker
 * caches it with the app: it works offline from the first visit. A new model
 * version arrives with the next app update.
 */
export const TRIAGE_TEXT_MODEL = compileModel(modelJson);
