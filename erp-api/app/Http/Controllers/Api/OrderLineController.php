<?php

namespace App\Http\Controllers\Api;

use App\Events\OrderKitchenUpdated;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderLine;
use App\Models\OrderSection;
use App\Models\Product;
use App\Support\MenuResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderLineController extends Controller
{
    /**
     * Ajoute un produit à la section — si ce produit y est déjà avec la même note (y compris
     * "pas de note" pour les deux), incrémente la quantité au lieu de dupliquer la ligne (même
     * logique que le panier du POS Vente directe côté front). Deux lignes du même produit avec
     * des notes différentes (ex. "bien cuit" / "saignant") restent volontairement deux lignes
     * distinctes — les fusionner écraserait silencieusement l'une des deux notes.
     *
     * Un combo (Product::is_combo) n'est PAS ajouté comme une ligne opaque : il est éclaté en une
     * OrderLine PAR COMPOSANT (voir addCombo()) — chaque poste de préparation ne voit et ne
     * marque alors que sa propre ligne, sans affecter les composants des autres postes du même
     * combo (voir Readme.md/CONTEXT.md pour le bug que ça corrige : "marquer prêt" dans une
     * station marquait aussi les composants d'une autre station).
     *
     * Diffuse la mise à jour (voir Readme.md : "à chaque ajout de produit, tout synchroniser") —
     * une section 'en_attente' n'intéresse pas la cuisine, mais une autre instance de
     * POS - Restaurant sur la même commande (ex. un second serveur) doit voir le panier à jour.
     */
    public function store(Request $request, OrderSection $orderSection)
    {
        $this->assertEditable($orderSection);

        $data = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
            // Requis uniquement si le produit est un menu (is_menu) — voir App\Support\MenuResolver.
            'menu_choices' => ['array'],
            'menu_choices.*.menu_group_id' => ['integer'],
            'menu_choices.*.product_ids' => ['array'],
            'menu_choices.*.product_ids.*' => ['integer'],
        ]);

        $quantity = $data['quantity'] ?? 1;
        $product = Product::query()->with('components')->findOrFail($data['product_id']);

        if ($product->is_combo) {
            $lines = $this->addCombo($orderSection, $product, $quantity);
        } elseif ($product->is_menu) {
            $lines = $this->addMenu($orderSection, $product, $quantity, $data['menu_choices'] ?? []);
        } else {
            $note = $data['note'] ?? null;
            $line = $orderSection->lines()->where('product_id', $product->id)->where('note', $note)->first();

            if ($line) {
                $line->increment('quantity', $quantity);
            } else {
                $line = $orderSection->lines()->create(['product_id' => $product->id, 'quantity' => $quantity, 'note' => $note]);
            }
            $lines = [$line];
        }

        event(new OrderKitchenUpdated($orderSection->order_id));

        return response()->json(collect($lines)->map->load('product'), 201);
    }

    /**
     * Une ligne par composant, taguée `combo_id` + une note reprenant le nom du combo ("Menu
     * Burger") pour garder le contexte visible en cuisine/au panier SANS écran supplémentaire —
     * réutilise l'affichage de note déjà existant (voir kitchen-card__line-note). Si ce même
     * combo a déjà des lignes dans cette section (on en recommande un), leurs quantités sont
     * incrémentées au prorata plutôt que de dupliquer les lignes (même esprit que le merge
     * product_id+note ci-dessus, mais matché sur product_id+combo_id : la note est déterministe
     * pour un combo, pas besoin de la comparer).
     *
     * @return array<int, OrderLine>
     */
    private function addCombo(OrderSection $orderSection, Product $combo, int $quantity): array
    {
        $lines = [];

        foreach ($combo->components as $component) {
            $addQuantity = $quantity * $component->pivot->quantity;

            $line = $orderSection->lines()
                ->where('product_id', $component->id)
                ->where('combo_id', $combo->id)
                ->first();

            if ($line) {
                $line->increment('quantity', $addQuantity);
            } else {
                $line = $orderSection->lines()->create([
                    'product_id' => $component->id,
                    'combo_id' => $combo->id,
                    'quantity' => $addQuantity,
                    'note' => $combo->name,
                ]);
            }

            $lines[] = $line;
        }

        return $lines;
    }

    /**
     * Même principe que addCombo() (une ligne par produit choisi, taguée `menu_id`, pour que
     * chaque poste de cuisine voie ses composants), mais les choix ne sont pas fixes : validés
     * par App\Support\MenuResolver contre les groupes du menu. Les lignes composants sont
     * `priced: false` (voir OrderController::pay) — c'est la ligne "porteuse" (product_id = le
     * menu lui-même, comme un produit normal) qui porte le prix fixe du menu, toujours dans
     * `$orderSection` (la section active côté staff au moment de l'ajout — jamais répartie,
     * contrairement aux composants, voir ci-dessous). Cette ligne porteuse est forcée
     * done/sent=true à la création — même astuce que les lignes de correction — car ce n'est pas
     * une tâche de préparation en soi, ses composants éclatés le sont déjà.
     *
     * `Product::split_by_section` (réglage admin sur le menu) : si actif, chaque composant part
     * dans une section dédiée à SON groupe (une par label, ex. "Entrée") plutôt que dans
     * `$orderSection` — voir resolveSectionForGroup(). Permet d'échelonner le service (envoyer
     * l'entrée en cuisine sans attendre le plat) au lieu de tout envoyer d'un coup. Toute
     * l'opération est transactionnelle : plusieurs sections peuvent être créées en une seule
     * requête, elle doit rester tout-ou-rien.
     *
     * @return array<int, OrderLine>
     */
    private function addMenu(OrderSection $orderSection, Product $menu, int $quantity, array $choices): array
    {
        return DB::transaction(function () use ($orderSection, $menu, $quantity, $choices) {
            $resolved = MenuResolver::resolve($menu, $choices, $quantity);
            $lines = [];

            foreach ($resolved['component_lines'] as $component) {
                $targetSection = $menu->split_by_section
                    ? $this->resolveSectionForGroup($orderSection->order, $component['group_label'])
                    : $orderSection;

                $line = $targetSection->lines()
                    ->where('product_id', $component['product_id'])
                    ->where('menu_id', $menu->id)
                    ->first();

                if ($line) {
                    $line->increment('quantity', $component['quantity']);
                } else {
                    $line = $targetSection->lines()->create([
                        'product_id' => $component['product_id'],
                        'menu_id' => $menu->id,
                        'quantity' => $component['quantity'],
                        'note' => $component['note'],
                        'priced' => false,
                    ]);
                }

                $lines[] = $line;
            }

            // Avec split_by_section, la ligne porteuse ne va PAS dans `$orderSection` (celle où le
            // staff a cliqué) mais dans une section dédiée unique "Addition", partagée par tous
            // les menus répartis de cette commande — sinon chaque ajout consommerait la section
            // active (auto-complétée juste en dessous, faute de rien à préparer) et obligerait à
            // cliquer "+ Ajouter une section" avant le menu suivant, accumulant des onglets vides
            // sans autre utilité que porter une seule ligne de facturation (retour utilisateur).
            $carrierSection = $menu->split_by_section
                ? $this->resolveCarrierSection($orderSection->order)
                : $orderSection;

            $carrier = $resolved['carrier_line'];
            $carrierLine = $carrierSection->lines()
                ->where('product_id', $carrier['product_id'])
                ->where('note', $carrier['note'])
                ->first();

            if ($carrierLine) {
                $carrierLine->increment('quantity', $carrier['quantity']);
            } else {
                $carrierLine = $carrierSection->lines()->create([
                    'product_id' => $carrier['product_id'],
                    'quantity' => $carrier['quantity'],
                    'note' => $carrier['note'],
                ]);
            }
            $carrierLine->forceFill(['done' => true, 'sent' => true])->save();
            $lines[] = $carrierLine;

            // La section de la ligne porteuse ne contient jamais que des lignes porteuses
            // (done/sent=true dès la création) — rien à préparer, donc jamais visible sur le
            // Kitchen Display pour la faire avancer (valider → demander → marquer faite →
            // envoyer), ce qui empêcherait le paiement de la commande entière (OrderController::pay
            // exige TOUTES les sections à 'seed').
            $this->autoCompleteIfNothingToPrepare($carrierSection);

            return $lines;
        });
    }

    /**
     * Section dédiée, unique et partagée par toute la commande, qui n'accueille QUE des lignes
     * porteuses de menus répartis (voir addMenu()) — trouvée par son nom fixe "Addition" ou créée
     * au premier menu réparti ajouté. Contrairement à resolveSectionForGroup(), aucune vérification
     * d'état : cette section ne va jamais en cuisine, rien n'empêche donc d'y ajouter une ligne de
     * plus même après qu'elle soit déjà passée à 'seed' (voir autoCompleteIfNothingToPrepare()).
     */
    private function resolveCarrierSection(Order $order): OrderSection
    {
        return $order->sections()->firstOrCreate(['name' => 'Addition'], ['state' => 'en_attente']);
    }

    /**
     * Fait passer directement une section à 'seed' si, une fois la ligne porteuse posée, TOUTES
     * ses lignes sont déjà done+sent — c'est-à-dire qu'il n'y a plus rien à préparer/envoyer en
     * cuisine (que des lignes porteuses de menu, jamais des composants normaux, qui démarrent
     * toujours à done=false). Sans effet si la section contient encore ne serait-ce qu'une ligne
     * non terminée (cas normal : la ligne porteuse partage sa section avec de vrais composants
     * quand split_by_section est désactivé). Reproduit le strict nécessaire de
     * OrderSectionController::valider()/envoyer() (stock_consumed, bascule de l'Order une fois
     * toutes ses sections à 'seed') sans repasser par ces endpoints HTTP.
     */
    private function autoCompleteIfNothingToPrepare(OrderSection $orderSection): void
    {
        $stillPending = $orderSection->lines()
            ->where(fn ($query) => $query->where('done', false)->orWhere('sent', false))
            ->exists();

        if ($stillPending) {
            return;
        }

        // `assertEditable()` en tête de store() garantit que $orderSection était 'en_attente' à
        // l'entrée de cette requête — jamais déjà 'seed' ici.
        $orderSection->forceFill(['state' => 'seed', 'asked_at' => now(), 'stock_consumed' => true])->save();

        $order = $orderSection->order;
        if ($order->sections()->where('state', '!=', 'seed')->doesntExist()) {
            $order->update(['state' => 'seed']);
        }
    }

    /**
     * Section cible d'un groupe pour un menu `split_by_section` — réutilise une section déjà
     * présente sur cette commande si son nom correspond exactement au label du groupe et est
     * encore éditable (`en_attente`, même règle que assertEditable() partout ailleurs — une fois
     * validée manuellement par le staff, verrouillée comme n'importe quelle autre section) : deux
     * menus différents avec un groupe "Entrée" atterrissent ainsi dans la même section tant
     * qu'elle n'a pas été validée, pour envoyer toutes les entrées de la table en cuisine en une
     * fois. Si "Entrée" est déjà verrouillée (validée, ou plus loin dans le cycle), jamais d'échec
     * bloquant : une nouvelle vague s'ouvre sous "Entrée 2" (puis "Entrée 3", ...), même principe
     * qu'une nouvelle tournée de commande sur un produit normal déjà envoyé.
     *
     * Contrairement à OrderSectionController::store, PAS de OrderSection::guardCanCreate() ici :
     * cette règle ("pas de nouvelle section tant que la dernière créée est vide") existe pour
     * éviter que le staff n'accumule des sections vides jamais remplies — un risque qui ne
     * s'applique pas ici, puisque la section créée reçoit sa ligne immédiatement après (voir
     * addMenu() juste en dessous), jamais laissée vide. Sans ce contournement, le tout premier
     * ajout d'un menu réparti sur une commande fraîchement ouverte (une seule section vide déjà
     * là) échouerait systématiquement — vérifié en testant ce cas précis.
     */
    private function resolveSectionForGroup(Order $order, string $label): OrderSection
    {
        for ($suffix = 1; ; $suffix++) {
            $candidateName = $suffix === 1 ? $label : "{$label} {$suffix}";
            $section = $order->sections()->where('name', $candidateName)->first();

            if (!$section) {
                // 'state' explicite plutôt que de compter sur le défaut SQL de la colonne : sans
                // ça, l'attribut reste vide en mémoire sur ce modèle fraîchement créé (jamais
                // rechargé depuis la base), ce qui a déjà causé un bug ailleurs (comparaison
                // ->state === 'en_attente' toujours fausse juste après création).
                return $order->sections()->create(['name' => $candidateName, 'state' => 'en_attente']);
            }

            if ($section->state === 'en_attente') {
                return $section;
            }
        }
    }

    /**
     * `quantity`/`note` sont tous deux "sometimes" : le front envoie l'un ou l'autre séparément
     * (incrémentation de quantité vs édition de la note), jamais les deux à la fois — voir
     * order-line.service.ts (updateQuantity/updateNote). Un champ absent du payload reste
     * inchangé plutôt que d'être écrasé.
     */
    public function update(Request $request, OrderLine $orderLine)
    {
        $this->assertEditable($orderLine->orderSection);

        $data = $request->validate([
            'quantity' => ['sometimes', 'integer', 'min:1'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        if (empty($data)) {
            throw ValidationException::withMessages([
                'quantity' => ['Rien à mettre à jour.'],
            ]);
        }

        // Une ligne issue de l'éclatement d'un menu (composant, menu_id renseigné, ou ligne
        // porteuse, product.is_menu) ne peut pas voir sa quantité changée isolément — la ligne
        // porteuse et ses composants doivent toujours rester synchronisés (voir
        // App\Support\MenuResolver), sinon un menu facturé 2× pourrait n'en préparer qu'1 en
        // cuisine. Même garde-fou que order-builder.ts::isMenuLine côté front, ici pour de vrai :
        // jamais fait confiance au bouton désactivé seul.
        if (isset($data['quantity']) && ($orderLine->menu_id !== null || $orderLine->product->is_menu)) {
            throw ValidationException::withMessages([
                'quantity' => ['Retire et rajoute ce menu pour changer sa quantité.'],
            ]);
        }

        $orderLine->update($data);

        event(new OrderKitchenUpdated($orderLine->orderSection->order_id));

        return $orderLine->load('product');
    }

    public function destroy(OrderLine $orderLine)
    {
        $this->assertEditable($orderLine->orderSection);

        // Même garde-fou que update() : supprimer isolément un composant ou la ligne porteuse
        // désynchroniserait le menu (facturé mais pas préparé, ou l'inverse) — voir
        // order-builder.ts::isMenuLine côté front, ici pour de vrai.
        if ($orderLine->menu_id !== null || $orderLine->product->is_menu) {
            throw ValidationException::withMessages([
                'quantity' => ['Retire et rajoute ce menu pour changer sa quantité.'],
            ]);
        }

        $orderId = $orderLine->orderSection->order_id;
        $orderLine->delete();

        event(new OrderKitchenUpdated($orderId));

        return response()->noContent();
    }

    /**
     * Seul moyen de retirer un menu déjà ajouté (voir destroy()/update(), qui refusent toute
     * modification isolée d'une ligne de menu) : supprime la ligne porteuse cliquée ET toutes les
     * lignes composants/porteuses de ce MÊME PRODUIT menu dans TOUTE la commande — pas seulement
     * l'instance cliquée. Volontairement pas plus précis : deux ajouts du même menu avec des
     * choix différents peuvent partager une même ligne composant (fusionnée par product_id+menu_id
     * dans une section, voir addMenu()), donc il n'existe aucun moyen fiable de ne retirer qu'UNE
     * seule instance sans risquer de laisser des composants orphelins ou une ligne porteuse
     * sans plus aucun composant. Simple et prévisible plutôt que faussement précis.
     *
     * Bloque si une partie de ce menu vit dans une section déjà validée (sauf la section
     * "Addition" dédiée aux lignes porteuses, voir resolveCarrierSection() — jamais envoyée en
     * cuisine à proprement parler, même une fois auto-complétée à 'seed') : une fois qu'une
     * section est passée en cuisine, la retirer silencieusement désynchroniserait ce qui a
     * réellement été demandé — direction la correction manuelle (OrderController::correction),
     * comme pour n'importe quel produit déjà envoyé.
     */
    public function destroyMenu(OrderLine $orderLine)
    {
        if (!$orderLine->priced || !$orderLine->product->is_menu) {
            throw ValidationException::withMessages([
                'quantity' => ['Cette ligne ne correspond pas à un menu.'],
            ]);
        }

        $order = $orderLine->orderSection->order;
        $menuId = $orderLine->product_id;

        $relatedLines = OrderLine::query()
            ->whereHas('orderSection', fn ($query) => $query->where('order_id', $order->id))
            ->where(fn ($query) => $query->where('product_id', $menuId)->orWhere('menu_id', $menuId))
            ->with('orderSection')
            ->get();

        foreach ($relatedLines as $line) {
            if ($line->orderSection->name !== 'Addition' && $line->orderSection->state !== 'en_attente') {
                throw ValidationException::withMessages([
                    'state' => ["Une partie de ce menu (section « {$line->orderSection->name} ») a déjà été validée — utilise une correction au lieu de le retirer."],
                ]);
            }
        }

        DB::transaction(function () use ($relatedLines) {
            foreach ($relatedLines as $line) {
                $line->delete();
            }
        });

        event(new OrderKitchenUpdated($order->id));

        return response()->noContent();
    }

    /**
     * Une section "demandée" (ou déjà "faite") est partie en cuisine — la modifier silencieusement
     * après coup désynchroniserait ce que la cuisine prépare de ce qui est réellement commandé.
     * Pour ajouter des articles après avoir demandé une section, il faut ouvrir une nouvelle
     * section (voir OrderSectionController::store).
     */
    private function assertEditable(OrderSection $orderSection): void
    {
        if ($orderSection->state !== 'en_attente') {
            throw ValidationException::withMessages([
                'state' => ['Cette section a déjà été envoyée en cuisine, elle ne peut plus être modifiée.'],
            ]);
        }
    }
}
