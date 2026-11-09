import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withNavigationErrorHandler,
  withPreloading,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { NavigationIssue } from './core/navigation-issue';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Every screen is downloaded right after start, so all of them work without signal later.
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withNavigationErrorHandler((error) => inject(NavigationIssue).report(error.error)),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    { provide: LOCALE_ID, useValue: 'es-CO' },
  ],
};
