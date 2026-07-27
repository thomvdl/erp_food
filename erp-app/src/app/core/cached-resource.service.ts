import { Observable, shareReplay } from 'rxjs';
import { ResourceService } from './resource.service';

/**
 * Same as ResourceService, but caches list() in memory (shareReplay) so
 * navigating away and back doesn't refetch. Invalidated automatically after
 * create/update/remove made through this same service instance.
 */
export abstract class CachedResourceService<T extends { id: number }> extends ResourceService<T> {
  private cache$: Observable<T[]> | null = null;

  override list(): Observable<T[]> {
    if (!this.cache$) {
      this.cache$ = super.list().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }

    return this.cache$;
  }

  protected override invalidate(): void {
    this.cache$ = null;
  }
}
