<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\CashSession;
use App\Models\Client;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductCatalog;
use App\Support\DiscountCalculator;
use App\Support\KioskSaleRecorder;
use App\Support\LoyaltyPoints;
use App\Support\MenuResolver;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * erp_self_order, mode kiosque uniquement (authentifié — voir routes/api.php, contrairement à
 * SelfOrderController qui gère le mode QR public). Ni le flux Order/OrderSection (POS Restaurant —
 * `OrderController::pay` refuse tant que les sections ne sont pas toutes 'seed', donc "payer
 * d'abord" y est impossible) ni le flux Ticket (vente directe — jamais suivi en cuisine) ne
 * couvrent seuls le besoin du kiosque : payer immédiatement ET être vu en cuisine (voir Readme.md,
 * "quand on est en mode kiosk la commande n'est jamais envoyée en cuisine"). Ce contrôleur gère le
 * variant "Terminal" (toujours simulé — voir kiosk-order.ts), qui encaisse et matérialise la vente
 * dans la même requête via App\Support\KioskSaleRecorder (Ticket + Order SANS table, section
 * directement 'ask', comme SelfOrderController::store en mode QR). Le variant "QR code" (paiement
 * Stripe/Bancontact réel, asynchrone) passe par KioskCheckoutController + StripeWebhookController,
 * qui appellent le même KioskSaleRecorder une fois le paiement confirmé — voir leurs docblocks.
 * Une fois entièrement 'seed' (préparée et servie), l'Order créée ici n'a plus lieu d'exister —
 * déjà payée — et se supprime automatiquement (voir OrderSectionController::envoyer).
 */
class KioskOrderController extends Controller
{
    /** Réutilisé par KioskCheckoutController/StripeWebhookController pour renvoyer un Ticket kiosque sous la même forme, quel que soit le variant de paiement. */
    public const TICKET_WITH = ['client', 'sections.lines.product.tax', 'payments.paymentMethod', 'discount'];

    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'cash_session_id' => ['required', 'integer', 'exists:cash_sessions,id'],
            'discount_code' => ['nullable', 'string'],
            'points_redeemed' => ['nullable', 'integer', 'min:1'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            // Requis uniquement si le produit est un menu (is_menu) — voir App\Support\MenuResolver.
            'lines.*.menu_choices' => ['array'],
            'lines.*.menu_choices.*.menu_group_id' => ['integer'],
            'lines.*.menu_choices.*.product_ids' => ['array'],
            'lines.*.menu_choices.*.product_ids.*' => ['integer'],
            'payments' => ['required', 'array', 'min:1'],
            'payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.value' => ['required', 'numeric', 'min:0.01'],
        ]);

        $client = isset($data['client_id']) ? Client::find($data['client_id']) : null;

        $cashSession = CashSession::query()->open()->find($data['cash_session_id']);

        if (!$cashSession) {
            throw ValidationException::withMessages([
                'cash_session_id' => ["Aucune session de caisse ouverte. Ouvrez une caisse avant d'encaisser."],
            ]);
        }

        $catalogIds = ProductCatalog::query()->where('active_kiosk', true)->where('active', true)->pluck('id');

        if ($catalogIds->isEmpty()) {
            throw ValidationException::withMessages([
                'lines' => ['Aucun catalogue disponible pour le moment.'],
            ]);
        }

        // Même garde-fou que SelfOrderController::store : ne fait jamais confiance au front pour
        // savoir quels produits sont vraiment self-order — union des catalogues actifs pour le
        // kiosque, pas un seul catalogue exclusif.
        $products = Product::query()
            ->whereHas('catalogs', fn ($query) => $query->whereIn('product_catalogs.id', $catalogIds))
            ->where('products.active', true)
            ->get()
            ->keyBy('id');

        foreach ($data['lines'] as $line) {
            if (!$products->has($line['product_id'])) {
                throw ValidationException::withMessages([
                    'lines' => ["Un des produits sélectionnés n'est plus disponible."],
                ]);
            }
        }

        // Voir App\Support\MenuResolver::expandLines — éclate tout produit `is_menu` en lignes
        // composants (unit_price=0, order_lines.priced=false) + une ligne porteuse au prix fixe
        // du menu, consommées ensuite identiquement par KioskSaleRecorder (ticket_lines +
        // order_lines).
        $lines = MenuResolver::expandLines($data['lines'], $products);

        $total = array_sum(array_map(fn (array $line) => $line['unit_price'] * $line['quantity'], $lines));

        // Réduction recalculée côté serveur (voir DiscountCalculator) — même principe que
        // TicketController::store/OrderController::pay : jamais un montant/total envoyé par le
        // client. Réservé à superviseur+ (voir Readme.md).
        $discount = null;
        $discountAmount = 0.0;
        if (!empty($data['discount_code'])) {
            abort_unless($request->user()->isAtLeastSuperviseur(), 403, "Seul un superviseur peut appliquer un code de réduction.");
            $discount = DiscountCalculator::resolve($data['discount_code']);
            $discountAmount = DiscountCalculator::amountOff($discount, $lines, $total);
            $total = max(round($total - $discountAmount, 2), 0);
        }

        // Réduction en points fidélité (voir App\Support\LoyaltyPoints) — même emplacement/logique
        // que TicketController::store, cumulable avec le code promo appliqué juste au-dessus.
        $pointsRedeemed = $data['points_redeemed'] ?? 0;
        $pointsRedeemedAmount = 0.0;
        if ($pointsRedeemed > 0) {
            $pointsRedeemedAmount = LoyaltyPoints::amountOff($pointsRedeemed, $client, $total);
            $total = max(round($total - $pointsRedeemedAmount, 2), 0);
        }

        $paidTotal = collect($data['payments'])->sum('value');

        if (round($paidTotal, 2) !== round($total, 2)) {
            throw ValidationException::withMessages([
                'payments' => ["Le total des paiements ({$paidTotal}) ne correspond pas au montant dû ({$total})."],
            ]);
        }

        [$ticket, $order] = KioskSaleRecorder::record(
            $lines,
            $cashSession,
            $discount,
            $discountAmount,
            $client,
            $data['payments'],
            $client ? LoyaltyPoints::earned($total) : 0,
            $pointsRedeemed,
            $pointsRedeemedAmount,
        );

        event(new OrderKitchenUpdated($order->id));

        return response()->json($ticket->load(self::TICKET_WITH), 201);
    }

    /**
     * Écran public "suivi des commandes" (voir erp_self_order > pages/order-status) : le client
     * regarde ce numéro (celui de son Ticket, voir ticket_id ci-dessus) passer d'"en préparation"
     * à "prêt" sans avoir à interroger le personnel. Public (pas de auth:sanctum, voir
     * routes/api.php) — ce n'est qu'une liste de numéros déjà remis au client sur son reçu, rien
     * de sensible à protéger, même principe que self-order/{qr_token} ou tables/{table}/qr.
     * 'ask' = en cuisine, en cours de préparation ; 'do' = prête, le client peut venir la
     * récupérer. Une fois "envoyée" (remise au client), l'Order est supprimée (voir
     * OrderSectionController::envoyer) et disparaît naturellement d'ici.
     */
    public function status()
    {
        $orders = Order::query()->whereNull('table_id')->whereIn('state', ['ask', 'do'])->orderBy('created_at')->get(['id', 'state', 'ticket_id']);

        return response()->json([
            'preparing' => $orders->where('state', 'ask')->pluck('ticket_id')->values(),
            'ready' => $orders->where('state', 'do')->pluck('ticket_id')->values(),
        ]);
    }
}
