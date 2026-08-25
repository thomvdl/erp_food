/** Adresse enregistrée par un client (voir ShopCustomerAddressController) — `address` est toujours
 *  le texte normalisé par Nominatim (App\Support\DeliveryZone), jamais la saisie brute. */
export interface ClientAddress {
  id: number;
  label: string | null;
  address: string;
  is_default: boolean;
}
