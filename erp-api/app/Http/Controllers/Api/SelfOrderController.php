<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductCatalog;
use App\Models\TableElement;
use App\Support\MenuResolver;
use App\Support\OpeningHours;
use App\Support\Qr;
use App\Support\StockManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * API publique (hors auth:sanctum) consommée par erp_self_order en mode QR — un client anonyme
 * scanne un code lié à une table/référence (voir tables.qr_token, généré automatiquement à la
 * création dans TableElement::booted()) et compose sa commande depuis son propre téléphone.
 * `qr_token` fait office de capacité : n'importe qui ayant le lien peut agir sur CETTE table,
 * rien d'autre — même principe que le PNG de QR déjà public ailleurs (voir
 * EventTicketController::qr).
 *
 * Volontairement minimal : pas de paiement ici (le client ne paie pas en mode QR, voir
 * erp_self_order) — chaque soumission ajoute une nouvelle section directement en 'ask' (voir
 * store(), "self order doit demander automatiquement en cuisine" — retour utilisateur), donc
 * visible tout de suite sur le kitchen display sans qu'un serveur ait à la valider/demander
 * manuellement. Un serveur n'intervient qu'ensuite, pour encaisser depuis Gestion des commandes.
 * Le mode kiosque, lui, n'utilise pas ces routes : un kiosque est un appareil authentifié comme
 * erp_kitchen_display/erp_validate_event, il passe par les routes normales (orders, tickets...).
 */
class SelfOrderController extends Controller
{
    /**
     * Contexte pour composer une commande : la table/référence visée + l'union des produits de
     * tous les catalogues actuellement actifs pour le self-order (voir
     * ProductCatalogController::setActiveForSelfOrder — plusieurs catalogues peuvent l'être à la
     * fois). Ne renvoie que ce dont erp_self_order a besoin, pas les modèles complets (pas de
     * coût matière) — c'est une route publique.
     */
    public function show(string $qrToken)
    {
        $table = TableElement::query()->where('qr_token', $qrToken)->where('active', true)->firstOrFail();

        // Voir App\Support\OpeningHours — tant que self_order_open_at/self_order_close_at
        // (Paramètres > Réglages) ne sont pas tous les deux configurés, aucune restriction.
        // Fermé : pas la peine de charger le catalogue, le client ne peut de toute façon rien
        // commander (voir store() ci-dessous).
        if (!OpeningHours::isOpen()) {
            return response()->json([
                'closed' => true,
                'message' => OpeningHours::closedMessage(),
                'table' => [
                    'label' => $table->label,
                    'room_name' => $table->room?->name,
                ],
            ]);
        }

        $catalogIds = ProductCatalog::query()->where('active_self_order', true)->where('active', true)->pluck('id');

        $products = Product::query()
            ->whereHas('catalogs', fn ($query) => $query->whereIn('product_catalogs.id', $catalogIds))
            ->where('products.active', true)
            ->with(['tax', 'category', 'menuGroups.options.ingredients', 'ingredients'])
            ->orderBy('name')
            ->get([
                'products.id', 'products.name', 'products.description', 'products.price', 'products.tax_id',
                'products.product_category_id', 'products.icon', 'products.image_path', 'products.stock_quantity',
                'products.is_menu',
            ]);

        return response()->json([
            'closed' => false,
            'table' => [
                'label' => $table->label,
                'room_name' => $table->room?->name,
            ],
            'products' => $products,
        ]);
    }

    /**
     * Ajoute une nouvelle section (un "tour" de commande) à la commande ouverte de cette table —
     * en crée une si la table était libre. Contrairement à une section créée depuis order-builder
     * (qui naît 'en_attente'), celle-ci passe directement en 'ask' : le client valide lui-même en
     * envoyant sa commande, pas besoin qu'un serveur la valide/demande à son tour.
     */
    public function store(Request $request, string $qrToken)
    {
        $table = TableElement::query()->where('qr_token', $qrToken)->where('active', true)->firstOrFail();

        // Ne fait pas confiance à l'écran affiché côté client : même hors horaires, une requête
        // directe à cette route ne doit jamais pouvoir créer de commande.
        if (!OpeningHours::isOpen()) {
            throw ValidationException::withMessages([
                'lines' => [OpeningHours::closedMessage()],
            ]);
        }

        $catalogIds = ProductCatalog::query()->where('active_self_order', true)->where('active', true)->pluck('id');

        if ($catalogIds->isEmpty()) {
            throw ValidationException::withMessages([
                'lines' => ['Aucun catalogue disponible pour le moment — demandez à un serveur.'],
            ]);
        }

        $data = $request->validate([
            'number_of_guests' => ['nullable', 'integer', 'min:1'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:20'],
            'lines.*.note' => ['nullable', 'string', 'max:255'],
            // Requis uniquement si le produit est un menu (is_menu) — voir App\Support\MenuResolver.
            'lines.*.menu_choices' => ['array'],
            'lines.*.menu_choices.*.menu_group_id' => ['integer'],
            'lines.*.menu_choices.*.product_ids' => ['array'],
            'lines.*.menu_choices.*.product_ids.*' => ['integer'],
            'lines.*.menu_choices.*.product_notes' => ['array'],
            'lines.*.menu_choices.*.product_notes.*.product_id' => ['integer'],
            'lines.*.menu_choices.*.product_notes.*.note' => ['nullable', 'string', 'max:255'],
        ]);

        // Ne fait jamais confiance au front pour savoir quels produits sont vraiment
        // self-order — un client ne doit pouvoir commander que ce que l'union des catalogues
        // actifs expose, même si un id de produit "deviné" existe par ailleurs dans un autre
        // catalogue non actif pour ce contexte.
        $allowedProductIds = Product::query()
            ->whereHas('catalogs', fn ($query) => $query->whereIn('product_catalogs.id', $catalogIds))
            ->where('products.active', true)
            ->pluck('products.id');

        foreach ($data['lines'] as $line) {
            if (!$allowedProductIds->contains($line['product_id'])) {
                throw ValidationException::withMessages([
                    'lines' => ["Un des produits sélectionnés n'est plus disponible."],
                ]);
            }
        }

        $products = Product::query()->whereIn('id', collect($data['lines'])->pluck('product_id'))->get()->keyBy('id');

        // Un menu (is_menu) s'éclate en plusieurs OrderLine : une par produit choisi (priced:
        // false, note=nom du menu) plus une ligne "porteuse" (product_id = le menu lui-même,
        // priced: true) qui porte le prix fixe du menu et est cachée du Kitchen Display
        // (hideFromKitchen), ses composants éclatés le montrant déjà. Voir
        // App\Support\MenuResolver::expandLines (unit_price ignoré ici, order_lines n'a pas de
        // colonne prix — voir OrderController::pay).
        $resolvedLines = MenuResolver::expandLines($data['lines'], $products);

        $order = DB::transaction(function () use ($table, $data, $resolvedLines) {
            $order = Order::query()->where('table_id', $table->id)->first();

            if (!$order) {
                $order = Order::query()->create([
                    'table_id' => $table->id,
                    'number_of_guests' => $data['number_of_guests'] ?? null,
                    'state' => 'send',
                    'source' => 'self_order',
                ]);
            }

            $sectionNumber = $order->sections()->count() + 1;
            $section = $order->sections()->create(['name' => "Commande client {$sectionNumber}"]);

            foreach ($resolvedLines as $line) {
                $orderLine = $section->lines()->create([
                    'product_id' => $line['product_id'],
                    'quantity' => $line['quantity'],
                    'note' => $line['note'],
                    'menu_id' => $line['menu_id'],
                    'priced' => $line['priced'],
                ]);

                if ($line['hideFromKitchen']) {
                    $orderLine->forceFill(['done' => true, 'sent' => true])->save();
                }
            }

            // Voir App\Support\StockManager — vérifie ET décrémente ICI, pas différé au paiement :
            // une commande self-order part directement en 'ask' (juste en dessous), un cran plus
            // engagée qu'une simple section "validée" côté POS Restaurant, qui décrémente déjà à
            // ce stade (voir OrderSectionController::valider()) — même moment de consommation
            // physique, donc même règle. `stock_consumed` évite qu'OrderController::pay() ne
            // décrémente une seconde fois cette section au paiement. Consomme toutes les lignes
            // (composants de menu inclus, priced ou pas) : ce sont les vrais produits servis.
            StockManager::consume(
                collect($resolvedLines)->map(fn (array $line) => ['product_id' => $line['product_id'], 'quantity' => $line['quantity']])->all(),
            );

            // "Self order demande automatiquement sa commande en cuisine" (retour utilisateur) :
            // contrairement à une section ajoutée depuis order-builder (en_attente, un serveur
            // doit valider puis demander), une commande client passe directement en 'ask' — même
            // transition que OrderSectionController::valider()+demander() enchaînées, sans
            // attendre d'action du personnel.
            $section->forceFill(['state' => 'ask', 'asked_at' => now(), 'stock_consumed' => true])->save();
            if ($order->state === 'send') {
                $order->update(['state' => 'ask']);
            }

            return $order;
        });

        event(new OrderKitchenUpdated($order->id));

        return response()->json(['order_id' => $order->id], 201);
    }

    /**
     * PNG du QR pointant vers le lien self-order de cette table — consommé directement en
     * <img src> depuis erp-app (impression), même principe que EventTicketController::qr.
     */
    public function qr(TableElement $table)
    {
        $url = rtrim(config('app.self_order_url'), '/') . '/' . $table->qr_token;

        return response(Qr::png($url), 200, ['Content-Type' => 'image/png']);
    }
}
