/** Réponse de ShopCustomerController::verifyCode/login — voir CustomerSessionService pour l'état
 *  persisté. */
export interface Customer {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string;
  points_balance: number;
}

/** Numéro inconnu, pas encore de compte — le front redemande prénom/nom avant de rappeler
 *  requestCode() avec (voir ShopCustomerController::requestCode). Même forme renvoyée par login()
 *  si le client a disparu entre-temps (voir CustomerSessionService.refresh()). */
export interface CustomerLoginResult {
  exists: false;
}

/** Réponse de ShopCustomerController::requestCode — soit le code vient d'être envoyé par email,
 *  soit le numéro est inconnu et le front doit redemander prénom/nom avant de réessayer. */
export interface RequestCodeResult {
  sent?: true;
  exists?: false;
}

export interface CustomerOrderLine {
  id: number;
  quantity: number;
  unit_price: number | string;
  is_correction: boolean;
  product?: { id: number; name: string };
}

export interface CustomerOrderSection {
  id: number;
  name: string | null;
  lines: CustomerOrderLine[];
}

/** Un Ticket (encaissement permanent) simplifié pour "Mes commandes" — voir
 *  ShopCustomerController::orders. Les Order (suivi cuisine/livraison) sont supprimées une fois
 *  servies/livrées, seul le Ticket reste comme trace durable. */
export interface CustomerOrder {
  id: number;
  paid_at: string;
  sections: CustomerOrderSection[];
}
