/** Numéros de ticket kiosque (voir KioskOrderController::status côté API) — 'preparing' = en
 *  cuisine, 'ready' = prête à récupérer. */
export interface OrderStatusBoard {
  preparing: number[];
  ready: number[];
}
