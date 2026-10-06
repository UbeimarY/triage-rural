import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

describe('ConnectivityService', () => {
  afterEach(() => setNavigatorOnline(true));

  it('should reflect offline and online browser events', () => {
    setNavigatorOnline(true);
    const service = TestBed.inject(ConnectivityService);
    expect(service.online()).toBe(true);

    setNavigatorOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(service.online()).toBe(false);

    setNavigatorOnline(true);
    window.dispatchEvent(new Event('online'));
    expect(service.online()).toBe(true);
  });
});
