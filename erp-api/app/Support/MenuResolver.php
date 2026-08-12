<?php

namespace App\Support;

use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Valide et résout les choix envoyés pour un produit `is_menu` (voir migration
 * add_is_menu_to_products_table et Readme.md > Menus). Contrairement à un combo (composition
 * FIXE, éclatée sans qu'aucun choix ne soit nécessaire), un menu a un ou plusieurs groupes — le
 * client doit choisir entre `min_choices` et `max_choices` produits par groupe, parmi les options
 * autorisées (`menu_groups`/`menu_group_options`).
 *
 * Ne touche jamais la base : c'est aux 4 contrôleurs qui composent une commande (OrderLine,
 * Ticket, SelfOrder, KioskOrder) de transformer le résultat en lignes réellement persistées —
 * cette classe ne fait QUE valider les choix et calculer quoi créer, pour éviter de dupliquer
 * cette logique de validation dans chacun des 4 points d'entrée.
 *
 * Prix fixe du menu (décision produit : le menu se facture à son propre prix, jamais à la somme
 * des produits choisis) : `carrier_line` porte `product_id = $menu->id`, exactement comme
 * n'importe quel ajout de produit normal — son prix découle donc du calcul de total déjà existant
 * (`Product::price` de CETTE ligne) sans aucun changement ailleurs. `component_lines` (un par
 * produit choisi, pour que chaque poste de cuisine sache quoi préparer) sont marquées
 * `priced: false` : à l'appelant de les exclure du total (voir order_lines.priced) ou de les
 * créer à `unit_price = 0` (ticket_lines, qui stocke déjà un prix figé par ligne).
 */
class MenuResolver
{
    /**
     * @param  array<int, array{menu_group_id: int, product_ids: array<int, int>}>  $choices
     * @return array{
     *     component_lines: array<int, array{product_id: int, quantity: int, note: string, priced: bool, menu_group_id: int, group_label: string}>,
     *     carrier_line: array{product_id: int, quantity: int, note: string, priced: bool},
     * }
     */
    public static function resolve(Product $menu, array $choices, int $quantity): array
    {
        $groups = $menu->menuGroups()->with('options')->get();

        if ($groups->isEmpty()) {
            throw ValidationException::withMessages([
                'menu_choices' => ["Ce menu n'a aucun groupe de choix configuré."],
            ]);
        }

        $choicesByGroup = collect($choices)->keyBy('menu_group_id');
        // Agrégé par (groupe, produit) et non par produit seul : App\Http\Controllers\Api\
        // OrderLineController::addMenu a besoin de savoir de quel groupe vient chaque ligne pour
        // router chaque composant vers sa propre section (voir Product::split_by_section). Si un
        // même produit est choisi dans deux groupes différents (cas rare), ça donne deux entrées
        // component_lines distinctes plutôt qu'une fusionnée — sans conséquence : la fusion en
        // ligne (par product_id+menu_id sur la section cible) absorbe les deux passages.
        $componentQuantities = [];
        $summaryParts = [];

        foreach ($groups as $group) {
            $entry = $choicesByGroup->get($group->id);
            $productIds = collect($entry['product_ids'] ?? [])->unique()->values();

            if ($productIds->count() < $group->min_choices || $productIds->count() > $group->max_choices) {
                throw ValidationException::withMessages([
                    'menu_choices' => ["Le groupe « {$group->label} » attend entre {$group->min_choices} et {$group->max_choices} choix (reçu : {$productIds->count()})."],
                ]);
            }

            $eligibleIds = $group->options->pluck('id');
            if ($productIds->diff($eligibleIds)->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'menu_choices' => ["Un produit choisi n'appartient pas au groupe « {$group->label} »."],
                ]);
            }

            if ($productIds->isNotEmpty()) {
                $names = $group->options->whereIn('id', $productIds)->pluck('name');
                $summaryParts[] = "{$group->label} : {$names->implode(', ')}";
            }

            foreach ($productIds as $productId) {
                $key = "{$group->id}:{$productId}";
                $componentQuantities[$key] = [
                    'product_id' => $productId,
                    'quantity' => ($componentQuantities[$key]['quantity'] ?? 0) + $quantity,
                    'menu_group_id' => $group->id,
                    'group_label' => $group->label,
                ];
            }
        }

        $componentLines = (new Collection($componentQuantities))
            ->map(fn (array $entry) => [
                'product_id' => $entry['product_id'],
                'quantity' => $entry['quantity'],
                'note' => $menu->name,
                'priced' => false,
                'menu_group_id' => $entry['menu_group_id'],
                'group_label' => $entry['group_label'],
            ])
            ->values()
            ->all();

        $carrierLine = [
            'product_id' => $menu->id,
            'quantity' => $quantity,
            'note' => implode(' — ', $summaryParts),
            'priced' => true,
        ];

        return ['component_lines' => $componentLines, 'carrier_line' => $carrierLine];
    }

    /**
     * Éclate une liste de lignes "brutes" (telles qu'envoyées par un client : product_id,
     * quantity, note?, menu_choices?) en lignes prêtes à persister, en résolvant chaque produit
     * `is_menu` via resolve() ci-dessus — factorise ce qui serait sinon dupliqué à l'identique
     * dans TicketController, SelfOrderController, KioskOrderController et KioskCheckoutController
     * (les 4 points d'entrée qui composent une commande à partir d'un tableau `lines` envoyé en
     * une fois, par opposition à OrderLineController qui ajoute un produit à la fois).
     *
     * Chaque entrée retournée porte tous les champs utiles aux deux tables possibles
     * (`ticket_lines.unit_price`, `order_lines.priced`) : à l'appelant de ne prendre que ceux
     * dont sa table a besoin. `hideFromKitchen` (jamais persisté) signale la ligne "porteuse" du
     * menu — à forcer `done`/`sent` = true si l'appelant crée des OrderLine (voir
     * OrderLineController::addMenu pour le même mécanisme sur l'ajout incrémental).
     *
     * @param  array<int, array{product_id: int, quantity: int, note?: ?string, menu_choices?: array}>  $requestedLines
     * @param  \Illuminate\Support\Collection<int, Product>  $products  keyBy('id'), doit contenir tous les product_id de $requestedLines
     * @return array<int, array{product_id: int, quantity: int, unit_price: float, note: ?string, menu_id: ?int, priced: bool, hideFromKitchen: bool}>
     */
    public static function expandLines(array $requestedLines, Collection $products): array
    {
        $lines = [];

        foreach ($requestedLines as $requestedLine) {
            $product = $products[$requestedLine['product_id']];

            if ($product->is_menu) {
                $resolved = self::resolve($product, $requestedLine['menu_choices'] ?? [], $requestedLine['quantity']);

                foreach ($resolved['component_lines'] as $component) {
                    $lines[] = [
                        'product_id' => $component['product_id'],
                        'quantity' => $component['quantity'],
                        'unit_price' => 0.0,
                        'note' => $component['note'],
                        'menu_id' => $product->id,
                        'priced' => false,
                        'hideFromKitchen' => false,
                    ];
                }

                $lines[] = [
                    'product_id' => $resolved['carrier_line']['product_id'],
                    'quantity' => $resolved['carrier_line']['quantity'],
                    'unit_price' => (float) $product->price,
                    'note' => $resolved['carrier_line']['note'],
                    'menu_id' => null,
                    'priced' => true,
                    'hideFromKitchen' => true,
                ];
            } else {
                $lines[] = [
                    'product_id' => $product->id,
                    'quantity' => $requestedLine['quantity'],
                    'unit_price' => (float) $product->price,
                    'note' => $requestedLine['note'] ?? null,
                    'menu_id' => null,
                    'priced' => true,
                    'hideFromKitchen' => false,
                ];
            }
        }

        return $lines;
    }
}
