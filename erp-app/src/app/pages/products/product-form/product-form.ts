import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductService } from '../../../core/product.service';
import { ProductCategoryService } from '../../../core/product-category.service';
import { ProductCatalogService } from '../../../core/product-catalog.service';
import { StationService } from '../../../core/station.service';
import { TaxService } from '../../../core/tax.service';
import { ProductCatalog, ProductCategory } from '../../../core/models/catalog.model';
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

  constructor() {
    this.categoryService.list().subscribe((categories) => this.categories.set(categories));
    this.catalogService.list().subscribe((catalogs) => this.catalogs.set(catalogs));
    this.stationService.list().subscribe((stations) => this.stations.set(stations));
    this.taxService.list().subscribe((taxes) => this.taxes.set(taxes));

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
