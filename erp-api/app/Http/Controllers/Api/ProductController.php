<?php

namespace App\Http\Controllers\Api;

use App\Events\ProductStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Support\ImageUpload;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProductController extends Controller
{
    // menuGroups.options.ingredients : nécessaire pour que la modale de choix d'un menu sache
    // quelles options ont des ingrédients retirables (voir pos-vente.ts/order-builder.ts/kiosk/
    // self-order, personnalisation d'un produit choisi À L'INTÉRIEUR d'un menu).
    private const WITH = ['station', 'category', 'catalogs', 'tax', 'components', 'menuGroups.options.ingredients', 'ingredients'];

    public function index()
    {
        return Product::query()->with(self::WITH)->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $catalogIds = $data['catalog_ids'] ?? [];
        $components = $data['component_ids'] ?? [];
        $menuGroups = $data['menu_group_ids'] ?? [];
        $ingredients = $data['ingredient_ids'] ?? [];
        unset($data['catalog_ids'], $data['component_ids'], $data['menu_group_ids'], $data['ingredient_ids']);

        $product = DB::transaction(function () use ($data, $catalogIds, $components, $menuGroups, $ingredients) {
            $product = Product::query()->create($data);
            $product->catalogs()->sync($catalogIds);
            $product->components()->sync($this->syncableComponents($components));
            $this->syncMenuGroups($product, $menuGroups);
            $product->ingredients()->sync($this->syncableIngredients($ingredients));

            return $product;
        });

        return response()->json($product->load(self::WITH), 201);
    }

    public function show(Product $product)
    {
        return $product->load(self::WITH);
    }

    public function update(Request $request, Product $product)
    {
        $data = $this->validated($request);
        $catalogIds = $data['catalog_ids'] ?? [];
        $components = $data['component_ids'] ?? [];
        $menuGroups = $data['menu_group_ids'] ?? [];
        $ingredients = $data['ingredient_ids'] ?? [];
        unset($data['catalog_ids'], $data['component_ids'], $data['menu_group_ids'], $data['ingredient_ids']);
        $data = array_merge($data, ImageUpload::clearIfIconChosen($product, $data['icon'] ?? null));

        $previousStock = $product->stock_quantity;

        DB::transaction(function () use ($product, $data, $catalogIds, $components, $menuGroups, $ingredients) {
            $product->update($data);
            $product->catalogs()->sync($catalogIds);
            $product->components()->sync($this->syncableComponents($components));
            $this->syncMenuGroups($product, $menuGroups);
            $product->ingredients()->sync($this->syncableIngredients($ingredients));
        });

        // Réapprovisionnement/correction manuelle depuis Paramètres > Produits — voir
        // App\Events\ProductStockUpdated, même diffusion qu'une vente (App\Support\StockManager),
        // pour que les écrans de vente déjà ouverts dégrisent le produit sans recharger la page.
        if ($product->stock_quantity !== $previousStock) {
            event(new ProductStockUpdated($product->id, $product->stock_quantity));
        }

        return $product->load(self::WITH);
    }

    public function destroy(Product $product)
    {
        $product->delete();

        return response()->noContent();
    }

    /**
     * Endpoint séparé du store/update JSON ci-dessus : évite le multipart imbriqué qu'exigerait
     * catalog_ids/component_ids si l'image partageait la même requête. Conséquence assumée côté
     * front : pas d'image possible tant que le produit n'existe pas encore (voir product-form.ts).
     */
    public function uploadImage(Request $request, Product $product)
    {
        $request->validate(['image' => ['required', 'image', 'max:4096']]);
        ImageUpload::store($product, $request->file('image'), 'products');

        return $product->fresh()->load(self::WITH);
    }

    public function removeImage(Product $product)
    {
        ImageUpload::remove($product);

        return $product->fresh()->load(self::WITH);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'price' => ['required', 'numeric', 'min:0'],
            'preparation_time' => ['nullable', 'integer', 'min:0'],
            'sku' => ['nullable', 'string', 'max:100'],
            'active' => ['boolean'],
            // null = stock non suivi pour ce produit (disponibilité illimitée, comportement
            // actuel) — voir App\Support\StockManager, jamais un simple 0 par défaut.
            'stock_quantity' => ['nullable', 'integer', 'min:0'],
            // Choix volontaire d'icône — mutuellement exclusif avec l'upload
            // d'image (voir ImageUpload::store/clearIfIconChosen) : en choisir une ici efface une
            // éventuelle image existante (voir ::update ci-dessus), mais un champ vide ne touche
            // jamais à une image déjà en place (une simple sauvegarde sans y toucher ne doit rien casser).
            'icon' => ['nullable', 'string', 'max:8'],
            'tax_id' => ['nullable', 'integer', 'exists:taxes,id'],
            'station_id' => ['nullable', 'integer', 'exists:stations,id'],
            'product_category_id' => ['nullable', 'integer', 'exists:product_categories,id'],
            'catalog_ids' => ['array'],
            'catalog_ids.*' => ['integer', 'exists:product_catalogs,id'],
            // "is_combo" : un produit composé de plusieurs autres (voir components ci-dessous) —
            // affiché éclaté au Kitchen Display, mais un simple Product partout ailleurs
            // (panier, ticket, facturation) — voir Product::components().
            'is_combo' => ['boolean'],
            'component_ids' => ['array'],
            // ->where('is_combo', false) : pas de combo imbriqué dans un combo, pour garder
            // l'éclatement du Kitchen Display à un seul niveau.
            'component_ids.*.product_id' => ['integer', Rule::exists('products', 'id')->where('is_combo', false)],
            'component_ids.*.quantity' => ['integer', 'min:1'],
            // "is_menu" : un produit composé de groupes de choix (voir menu_groups) — le client
            // choisit entre min_choices et max_choices produits par groupe au moment de la
            // commande (voir App\Support\MenuResolver), contrairement au combo qui est une
            // composition fixe sans aucun choix.
            'is_menu' => ['boolean'],
            // Voir OrderLineController::addMenu — répartit chaque groupe dans sa propre
            // OrderSection (une par label de groupe) plutôt que la section active du staff, pour
            // échelonner le service (POS Restaurant uniquement).
            'split_by_section' => ['boolean'],
            // "menu_group_ids" (écriture) distinct de "menu_groups" (lecture, voir WITH) — même
            // convention read/write-split que catalog_ids/catalogs et component_ids/components.
            'menu_group_ids' => ['array'],
            'menu_group_ids.*.label' => ['required', 'string', 'max:255'],
            'menu_group_ids.*.min_choices' => ['required', 'integer', 'min:0'],
            'menu_group_ids.*.max_choices' => ['required', 'integer', 'min:0'],
            'menu_group_ids.*.product_ids' => ['required', 'array', 'min:1'],
            // Pas de menu/combo imbriqué dans un groupe — même principe que component_ids
            // ci-dessus, pour garder l'éclatement du Kitchen Display à un seul niveau.
            'menu_group_ids.*.product_ids.*' => [
                'integer',
                Rule::exists('products', 'id')->where('is_combo', false)->where('is_menu', false),
            ],
            // Ingrédients de CE produit (voir Product::ingredients) — "removable" détermine si le
            // client peut le décocher au panier (ex. le pain reste coché, non décochable).
            'ingredient_ids' => ['array'],
            'ingredient_ids.*.ingredient_id' => ['integer', 'exists:ingredients,id'],
            'ingredient_ids.*.removable' => ['boolean'],
        ]);

        // Pas de règle Laravel native pour comparer deux champs du même élément d'un tableau
        // ("gte:menu_groups.*.min_choices" comparerait au premier élément du tableau, pas à celui
        // du même groupe) — vérifié manuellement ici, groupe par groupe.
        foreach ($data['menu_group_ids'] ?? [] as $index => $group) {
            if (($group['max_choices'] ?? 0) < ($group['min_choices'] ?? 0)) {
                throw ValidationException::withMessages([
                    "menu_group_ids.{$index}.max_choices" => ['max_choices doit être supérieur ou égal à min_choices.'],
                ]);
            }

            if (($group['max_choices'] ?? 0) > count($group['product_ids'] ?? [])) {
                throw ValidationException::withMessages([
                    "menu_group_ids.{$index}.max_choices" => ['max_choices ne peut pas dépasser le nombre de produits proposés dans le groupe.'],
                ]);
            }
        }

        return $data;
    }

    /**
     * @param array<int, array{product_id: int, quantity: int}> $components
     * @return array<int, array{quantity: int}>
     */
    private function syncableComponents(array $components): array
    {
        return collect($components)->mapWithKeys(fn (array $component) => [
            $component['product_id'] => ['quantity' => $component['quantity'] ?? 1],
        ])->all();
    }

    /**
     * @param array<int, array{ingredient_id: int, removable?: bool}> $ingredients
     * @return array<int, array{removable: bool}>
     */
    private function syncableIngredients(array $ingredients): array
    {
        return collect($ingredients)->mapWithKeys(fn (array $ingredient) => [
            $ingredient['ingredient_id'] => ['removable' => $ingredient['removable'] ?? true],
        ])->all();
    }

    /**
     * Remplacement complet des groupes de choix à chaque sauvegarde (plus simple qu'un diff, et
     * sans risque : contrairement à product_components, aucune ligne de commande ne référence
     * jamais menu_group_id — seulement menu_id au niveau du produit — donc rien n'est orphelin en
     * supprimant/recréant les groupes). `delete()` cascade sur menu_group_options (voir migration).
     *
     * @param array<int, array{label: string, min_choices: int, max_choices: int, product_ids: array<int, int>}> $groups
     */
    private function syncMenuGroups(Product $product, array $groups): void
    {
        $product->menuGroups()->delete();

        foreach ($groups as $position => $group) {
            $menuGroup = $product->menuGroups()->create([
                'label' => $group['label'],
                'min_choices' => $group['min_choices'],
                'max_choices' => $group['max_choices'],
                'position' => $position,
            ]);

            $menuGroup->options()->sync($group['product_ids']);
        }
    }
}
