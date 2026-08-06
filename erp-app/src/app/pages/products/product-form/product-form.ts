import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductService } from '../../../core/product.service';
import { ProductCategoryService } from '../../../core/product-category.service';
import { ProductCatalogService } from '../../../core/product-catalog.service';
import { StationService } from '../../../core/station.service';
import { TaxService } from '../../../core/tax.service';
import { ProductCatalog, ProductCategory } from '../../../core/models/catalog.model';
import { Product } from '../../../core/models/product.model';
import { Station, Tax } from '../../../core/models/reference.model';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './product-form.html',
})
export class ProductForm {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(ProductCategoryService);
  private readonly catalogService = inject(ProductCatalogService);
  private readonly stationService = inject(StationService);
  private readonly taxService = inject(TaxService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private id: number | null = null;
  readonly isEdit = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly categories = signal<ProductCategory[]>([]);
  readonly catalogs = signal<ProductCatalog[]>([]);
  readonly stations = signal<Station[]>([]);
  readonly taxes = signal<Tax[]>([]);
  readonly allProducts = signal<Product[]>([]);

  readonly name = signal('');
  readonly description = signal('');
  readonly price = signal<number>(0);
  readonly preparationTime = signal<number | null>(null);
  readonly sku = signal('');
  readonly active = signal(true);
  readonly categoryId = signal<number | null>(null);
  readonly catalogIds = signal<number[]>([]);
  readonly stationId = signal<number | null>(null);
  readonly taxId = signal<number | null>(null);

  /** Combo = produit composé de plusieurs autres (voir Product.components) — la sélection de
   *  composants réutilise la liste des produits déjà chargés par ce même formulaire de gestion. */
  readonly isCombo = signal(false);
  readonly componentQuantities = signal<Map<number, number>>(new Map());
  /** Recherche pour trouver un produit à ajouter au combo — voir componentSearchResults(). */
  readonly componentSearch = signal('');

  /**
   * "Mettre à jour les composants pour n'afficher que les éléments actifs" (voir Readme.md) —
   * mais sans faire disparaître silencieusement la valeur DÉJÀ choisie sur ce produit si elle
   * vient d'être désactivée entretemps (sinon un simple "Enregistrer" sans y toucher la
   * détacherait par accident, le <select> ne montrant plus aucune option correspondante).
   */
  readonly selectableCategories = computed(() => this.categories().filter((c) => c.active || c.id === this.categoryId()));
  readonly selectableStations = computed(() => this.stations().filter((s) => s.active || s.id === this.stationId()));
  readonly selectableTaxes = computed(() => this.taxes().filter((t) => t.active || t.id === this.taxId()));
  readonly selectableCatalogs = computed(() =>
    this.catalogs().filter((catalog) => catalog.active || this.catalogIds().includes(catalog.id)),
  );

  /** Un combo ne peut pas se composer de lui-même ni d'un autre combo (voir ProductController,
   *  même contrainte imposée côté serveur) — évite un combo imbriqué qui casserait
   *  l'éclatement à un seul niveau du Kitchen Display. */
  readonly availableComponents = computed(() => this.allProducts().filter((p) => !p.is_combo && p.id !== this.id));

  /** Résultats de recherche pour ajouter un composant — exclut ceux déjà dans le combo. Limité à
   *  8 résultats (même logique que la recherche client du POS) : c'est une liste à parcourir
   *  vite, pas un tableau exhaustif. */
  readonly componentSearchResults = computed(() => {
    const term = this.componentSearch().trim().toLowerCase();
    if (!term) {
      return [];
    }
    const selected = this.componentQuantities();
    return this.availableComponents()
      .filter((product) => !selected.has(product.id) && product.name.toLowerCase().includes(term))
      .slice(0, 8);
  });

  /** Composants déjà ajoutés au combo, avec leur produit complet et leur quantité — dérivé de
   *  componentQuantities() + allProducts() pour afficher le nom sans requête supplémentaire. */
  readonly selectedComponents = computed(() => {
    const products = new Map(this.allProducts().map((p) => [p.id, p]));
    return Array.from(this.componentQuantities().entries())
      .map(([productId, quantity]) => ({ product: products.get(productId), quantity }))
      .filter((item): item is { product: Product; quantity: number } => !!item.product);
  });

  constructor() {
    this.categoryService.list().subscribe((categories) => this.categories.set(categories));
    this.catalogService.list().subscribe((catalogs) => this.catalogs.set(catalogs));
    this.stationService.list().subscribe((stations) => this.stations.set(stations));
    this.taxService.list().subscribe((taxes) => this.taxes.set(taxes));
    this.productService.list().subscribe((products) => this.allProducts.set(products));

    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      this.id = idParam ? Number(idParam) : null;
      this.isEdit.set(this.id !== null);

      if (this.id !== null) {
        this.productService.get(this.id).subscribe({
          next: (product) => {
            this.name.set(product.name);
            this.description.set(product.description ?? '');
            this.price.set(Number(product.price));
            this.preparationTime.set(product.preparation_time);
            this.sku.set(product.sku ?? '');
            this.active.set(product.active);
            this.categoryId.set(product.product_category_id);
            this.catalogIds.set((product.catalogs ?? []).map((catalog) => catalog.id));
            this.stationId.set(product.station_id);
            this.taxId.set(product.tax_id);
            this.isCombo.set(product.is_combo);
            this.componentQuantities.set(new Map((product.components ?? []).map((c) => [c.id, c.pivot.quantity])));
          },
          error: () => this.error.set('Impossible de charger le produit.'),
        });
      }
    });
  }

  isCatalogChecked(catalogId: number): boolean {
    return this.catalogIds().includes(catalogId);
  }

  toggleCatalog(catalogId: number, checked: boolean): void {
    const current = this.catalogIds();
    this.catalogIds.set(checked ? [...current, catalogId] : current.filter((id) => id !== catalogId));
  }

  addComponent(productId: number): void {
    const next = new Map(this.componentQuantities());
    next.set(productId, 1);
    this.componentQuantities.set(next);
    this.componentSearch.set('');
  }

  removeComponent(productId: number): void {
    const next = new Map(this.componentQuantities());
    next.delete(productId);
    this.componentQuantities.set(next);
  }

  /** Décrémenter jusqu'à 0 retire le composant du combo — même convention que le panier POS
   *  (voir pos-vente.ts::decrementCartLine). */
  setComponentQuantity(productId: number, quantity: number): void {
    if (quantity <= 0) {
      this.removeComponent(productId);
      return;
    }
    const next = new Map(this.componentQuantities());
    next.set(productId, quantity);
    this.componentQuantities.set(next);
  }

  submit(): void {
    this.error.set(null);
    this.saving.set(true);

    const payload = {
      name: this.name(),
      description: this.description() || null,
      price: this.price(),
      preparation_time: this.preparationTime(),
      sku: this.sku() || null,
      active: this.active(),
      product_category_id: this.categoryId(),
      catalog_ids: this.catalogIds(),
      station_id: this.stationId(),
      tax_id: this.taxId(),
      is_combo: this.isCombo(),
      component_ids: this.isCombo()
        ? Array.from(this.componentQuantities().entries()).map(([product_id, quantity]) => ({ product_id, quantity }))
        : [],
    };

    const request =
      this.isEdit() && this.id !== null
        ? this.productService.update(this.id, payload)
        : this.productService.create(payload);

    request.subscribe({
      next: () => this.router.navigateByUrl('/produits'),
      error: () => {
        this.saving.set(false);
        this.error.set("Impossible d'enregistrer le produit.");
      },
    });
  }
}
