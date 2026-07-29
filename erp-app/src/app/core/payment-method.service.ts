import { Injectable } from '@angular/core';
import { CachedResourceService } from './cached-resource.service';
import { PaymentMethod } from './models/ticket.model';

@Injectable({ providedIn: 'root' })
export class PaymentMethodService extends CachedResourceService<PaymentMethod> {
  protected readonly endpoint = 'payment-methods';
}
