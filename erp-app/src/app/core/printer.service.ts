import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { Printer } from './models/reference.model';

@Injectable({ providedIn: 'root' })
export class PrinterService extends CachedResourceService<Printer> {
  protected readonly endpoint = 'printers';
}
