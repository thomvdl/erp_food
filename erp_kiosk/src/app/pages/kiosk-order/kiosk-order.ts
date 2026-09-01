import { Component, OnDestroy, OnInit, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { KioskPaymentEchoService } from '../../core/kiosk-payment-echo.service';
import { KioskService } from '../../core/kiosk.service';
import { ActivePrinterService } from '../../core/active-printer.service';
import { ProductStockEchoService } from '../../core/product-stock-echo.service';
import {
  Client,
  KioskBanner,
  KioskCheckout,
  KioskCheckoutState,
  MenuChoice,
  MenuChoiceProductNote,
  MenuGroup,
  MenuOption,
  PaymentMethod,
  Product,
  Ticket,
  ValidateDiscountResponse,
} from '../../core/models/kiosk.model';
import { TicketReceipt } from '../../shared/ticket-receipt/ticket-receipt';

interface CartLine {
  /** Identifiant purement client — plusieurs lignes peuvent partager le même product.id depuis
   *  l'introduction des menus (deux ajouts du même menu avec des choix différents restent deux
   *  lignes distinctes, voir addToCart/confirmAddMenu). */
  lineId: number;
  product: Product;
  quantity: number;
  /** Choix du client pour un produit `is_menu` (voir App\Support\MenuResolver côté API) — absent
   *  pour un produit normal. */
  menuChoices?: MenuChoice[];
  /** Ingrédients retirés (voir Product.ingredients/modale de personnalisation) — résumé en texte
   *  libre ("Sans oignon, sans fromage"), envoyé tel quel au serveur (jamais validé contre la
   *  vraie liste d'ingrédients, comme n'importe quelle autre note). */
  note?: string | null;
}

interface CategoryFilter {
  id: number | null;
  name: string;
  count: number;
  /** Voir ProductCategory.icon/image_url — absents pour le bucket "Autres" (id null, produits
   *  sans catégorie, pas une vraie catégorie). */
  icon: string | null;
  image_url: string | null;
  /** Voir ProductCategory.position — MAX_SAFE_INTEGER pour "Autres" afin qu'il reste en dernier. */
  position: number;
}

type PaymentVariant = 'qr' | 'terminal';
type DiningMode = 'dine_in' | 'takeaway';

const PRODUCT_EMOJIS = ['🍽️', '🥗', '🍔', '🍰', '🥤', '🍕', '🍜', '🥐', '🍦', '🥙'];

/** Un numéro de table tient largement là-dedans ("12", "A3"…) — la colonne côté API autorise
 *  jusqu'à 20 caractères (voir migration add_table_number_to_kiosk_tables), la limite ici n'est
 *  que pour garder la saisie tactile confortable. */
const MAX_TABLE_NUMBER_LENGTH = 6;

/** En dessous de ce nombre restant, le stock affiché passe en couleur d'alerte — purement
 *  visuel, n'affecte ni la commande ni le calcul. */
const LOW_STOCK_THRESHOLD = 3;

/**
 * Écran client du kiosque — "comme dans un fast food" (voir Readme du projet) : vente directe en
 * self-service, paiement immédiat au kiosque (contrairement au mode QR, qui n'encaisse jamais).
 * Catalogues utilisés : l'union de tous ceux marqués active_kiosk (voir
 * ProductCatalogController::setActiveForKiosk — plusieurs catalogues peuvent l'être à la fois),
 * indépendant des catalogues active_self_order utilisés par le mode QR — voir Paramètres >
 * Catalogue dans erp-app pour choisir quels catalogues sont actifs pour le kiosque.
 *
 * "Seulement deux moyens de paiement pour le kiosque : QR code ou terminal Bancontact" (retour
 * utilisateur) — pas d'espèces (kiosque non surveillé, pas de fond de caisse à gérer) ni de choix
 * multiple. Un seul moyen possible => pas de paiement fractionné, contrairement au POS d'erp-app.
 * Les deux variants divergent dans leur implémentation (voir choosePaymentVariant()) : "QR code"
 * est un vrai paiement Stripe Checkout, enregistré sous le payment_method "QR Code" — distinct de
 * "Bancontact" côté ERP pour pouvoir reconnaître/réconcilier séparément les deux dans les rapports
 * de caisse, même si les deux passent par Bancontact au sens du réseau bancaire (voir
 * startQrCheckout()/KioskCheckoutController), pendant que "Terminal"
 * reste entièrement simulé (voir confirmSimulatedPayment()/KioskOrderController) — un vrai
 * terminal Bancontact nécessiterait le SDK Stripe Terminal, hors périmètre pour l'instant.
 */
@Component({
  selector: 'app-kiosk-order',
  imports: [FormsModule, TicketReceipt],
  templateUrl: './kiosk-order.html',
  styleUrl: './kiosk-order.css',
})
export class KioskOrder implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly kioskService = inject(KioskService);
  private readonly activePrinterService = inject(ActivePrinterService);
  private readonly kioskPaymentEcho = inject(KioskPaymentEchoService);
  private readonly productStockEcho = inject(ProductStockEchoService);
  private readonly router = inject(Router);

  /** Retour auto à "Nouvelle commande" 10s après le paiement — voir Readme.md. */
  private static readonly NEW_ORDER_DELAY_MS = 10000;
  private newOrderTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Filet de secours pour le paiement QR — voir docblock de kiosk-payment-echo.service.ts, un
   *  appareil kiosque n'est pas surveillé, ne pas dépendre uniquement du websocket. */
  private static readonly CHECKOUT_POLL_INTERVAL_MS = 3000;
  private checkoutPollHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Un seul abonnement pour toute la durée de vie du composant — kioskPaymentEcho ne relaie
    // jamais un event pour un checkout qui n'est plus activeCheckout() (voir listen(), qui quitte
    // toujours le canal précédent avant de s'abonner au suivant), donc pas besoin de filtrer par id
    // ici, juste de rafraîchir l'état depuis le serveur (source de vérité, jamais le payload de
    // l'event — voir refreshCheckoutStatus()).
    this.kioskPaymentEcho.events.pipe(takeUntilDestroyed()).subscribe(() => this.refreshCheckoutStatus());

    // Voir App\Events\ProductStockUpdated — grise/dégrise une tuile produit en direct (vente
    // depuis un autre poste, ou réapprovisionnement admin) sans recharger tout le menu.
    this.productStockEcho.listen();
    this.productStockEcho.stockUpdated.pipe(takeUntilDestroyed()).subscribe(({ productId, stockQuantity }) => {
      this.allProducts.set(
        this.allProducts().map((product) => (product.id === productId ? { ...product, stock_quantity: stockQuantity } : product)),
      );
    });

    // Scrollspy : la pastille active de kiosk-category-strip suit la section actuellement en
    // haut de l'écran pendant qu'on défile, sans qu'il faille taper une pastille (retour
    // utilisateur). Réexécuté à chaque fois que la liste de sections change (groupedCategories)
    // ou qu'on quitte/rentre dans homeScreen — onCleanup déconnecte l'observer précédent avant
    // d'en recréer un, et au destroy du composant.
    afterRenderEffect((onCleanup) => {
      this.groupedCategories();
      if (this.homeScreen()) return;

      const menu = document.querySelector('.kiosk-menu') as HTMLElement | null;
      const nav = document.querySelector('.kiosk-category-strip') as HTMLElement | null;
      const sections = document.querySelectorAll('.kiosk-category-section');
      if (!menu || !nav || sections.length === 0) return;

      // .kiosk-category-strip est sticky EN HAUT de .kiosk-menu (le carrousel hero défile, lui,
      // normalement au-dessus) — --kiosk-sticky-offset pilote scroll-margin-top sur les sections
      // (voir CSS) pour que scrollToCategory()/scrollIntoView ne les cache pas derrière la barre.
      // Un ResizeObserver la garde synchronisée plutôt qu'une valeur codée en dur, même pattern
      // que erp_public_shop/pages/catalog.
      const syncStickyOffset = () => document.documentElement.style.setProperty('--kiosk-sticky-offset', `${nav.getBoundingClientRect().height}px`);
      syncStickyOffset();
      const resizeObserver = new ResizeObserver(syncStickyOffset);
      resizeObserver.observe(nav);

      const observer = new IntersectionObserver(
        (entries) => {
          if (this.scrollSpyMuted) return;
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length === 0) return;

          const raw = (visible[0].target as HTMLElement).dataset['categoryId'];
          const categoryId = raw === 'other' ? null : Number(raw);
          if (this.selectedCategoryId() !== categoryId) this.selectedCategoryId.set(categoryId);
        },
        // N'observe que la bande sous la barre sticky — une section devient active dès que son
        // bord haut y entre, pas seulement quand elle occupe tout l'écran.
        { root: menu, rootMargin: `-${nav.getBoundingClientRect().height}px 0px -70% 0px`, threshold: 0 },
      );

      sections.forEach((section) => observer.observe(section));
      onCleanup(() => {
        resizeObserver.disconnect();
        observer.disconnect();
      });
    });
  }

  /** Coupe temporairement le scrollspy ci-dessus pendant un défilement déclenché par un clic
   *  (scrollToCategory) — sans ça, les sections traversées pendant l'animation smooth-scroll
   *  activent brièvement leur propre pastille avant d'atteindre la cible, un scintillement visible
   *  sur un petit écran kiosque. */
  private scrollSpyMuted = false;

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  private readonly allProducts = signal<Product[]>([]);
  /** Plusieurs catalogues peuvent être actifs à la fois pour le kiosque, voir
   *  ProductCatalog.active_kiosk. */
  private readonly activeCatalogIds = signal<number[]>([]);
  private readonly paymentMethods = signal<PaymentMethod[]>([]);
  private cashSessionId: number | null = null;

  /** Carrousel hero affiché entre la topbar et les catégories (voir Paramètres > Bannières
   *  kiosque côté erp-app) — trié/filtré ici comme activeCatalogIds ci-dessus plutôt que côté
   *  serveur, l'API renvoie tout (actif ou non) pour que l'admin puisse aussi les gérer. */
  private readonly banners = signal<KioskBanner[]>([]);
  readonly visibleBanners = computed(() =>
    this.banners()
      .filter((banner) => banner.active)
      .sort((a, b) => a.position - b.position),
  );
  readonly activeBannerIndex = signal(0);
  private static readonly BANNER_INTERVAL_MS = 6000;
  private bannerInterval: ReturnType<typeof setInterval> | null = null;

  readonly cart = signal<CartLine[]>([]);
  private nextCartLineId = 1;
  readonly selectedCategoryId = signal<number | null>(null);

  // --- Menu à choix (voir App\Support\MenuResolver côté API) — un menu ne s'ajoute jamais
  // directement au panier : cette modale bloque tant que chaque groupe n'a pas un nombre de
  // sélections entre min_choices et max_choices, même pattern que pos-vente.ts côté erp-app. ---
  readonly showMenuModal = signal<Product | null>(null);
  readonly menuSelections = signal<Map<number, number[]>>(new Map());
  /** Nombre d'exemplaires de CETTE configuration (mêmes choix) à ajouter en un coup — voir
   *  confirmAddMenu(). */
  readonly menuQuantity = signal(1);
  /** Ingrédients retirés PAR produit choisi dans le menu (ex. le burger pris comme plat), pas
   *  pour le menu lui-même — clé "{groupId}:{productId}", même pattern que pos-vente.ts. */
  readonly menuOptionExclusions = signal<Map<string, Set<number>>>(new Map());
  readonly showMenuOptionIngredientsModal = signal<{ group: MenuGroup; product: MenuOption } | null>(null);
  readonly menuOptionExcludedIngredientIds = signal<Set<number>>(new Set());

  readonly canConfirmMenu = computed(() => {
    const product = this.showMenuModal();
    return !!product && (product.menu_groups ?? []).every((group) => this.isMenuGroupValid(group));
  });

  // --- Personnalisation des ingrédients (voir Product.ingredients) — modale ouverte au clic
  // uniquement si le produit a au moins un ingrédient retirable, sinon ajout direct comme avant. ---
  readonly showIngredientsModal = signal<Product | null>(null);
  readonly excludedIngredientIds = signal<Set<number>>(new Set());
  readonly ingredientsQuantity = signal(1);

  /** Réglage Paramètres > Réglages "kiosk_table_available" (voir KioskConfig/kiosk-config côté
   *  API) — active l'écran "sur place / à emporter" ci-dessous avant que le client puisse
   *  commencer sa commande. `false` par défaut (avant que la config ait répondu) : jamais
   *  d'écran superflu si le réglage est désactivé/absent. */
  readonly tableNumberEnabled = signal(false);
  /** `null` tant que le client n'a pas choisi — voir orderContextReady()/kiosk-order.html. */
  readonly diningMode = signal<DiningMode | null>(null);
  readonly tableNumberInput = signal('');
  /** Distinct de `!!tableNumberInput()` : une fois "Valider" pressé, l'écran clavier laisse place
   *  à l'accueil — voir confirmTableNumber(). */
  readonly tableNumberConfirmed = signal(false);

  /** Le client peut commencer à composer sa commande (voir kiosk-order.html) — soit le réglage
   *  est désactivé, soit "à emporter" a été choisi, soit "sur place" ET un numéro de table
   *  confirmé. */
  readonly orderContextReady = computed(
    () => !this.tableNumberEnabled() || this.diningMode() === 'takeaway' || (this.diningMode() === 'dine_in' && this.tableNumberConfirmed()),
  );

  /** Écran d'accueil (grille de catégories, voir kiosk-order.html) vs écran de navigation dans
   *  une catégorie — purement visuel (aucune donnée métier derrière), nécessaire pour le
   *  redesign portrait (notion/kiosk/) qui sépare les deux au lieu de tout afficher d'un coup
   *  dans une mise en page à 3 colonnes. */
  readonly homeScreen = signal(true);
  /** Tiroir "Mon panier" (voir kiosk-order.html) — replié par défaut, occupe tout l'écran une
   *  fois ouvert (portrait, pas de place pour un panier permanent à côté de la grille produits). */
  readonly cartDrawerOpen = signal(false);

  readonly showPaymentModal = signal(false);
  /** Aucun de ces deux "boutons" n'est un vrai moyen de paiement séparé — voir docblock de
   *  classe — juste quel écran de simulation afficher une fois choisi. */
  readonly simulatingVariant = signal<PaymentVariant | null>(null);
  readonly submitting = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly paidTicket = signal<Ticket | null>(null);

  /** État de l'impression thermique (voir printTicket() plus bas) — même pattern que
   *  pos-vente.ts/order-builder.ts côté erp-app. */
  readonly printingThermal = signal(false);
  readonly thermalPrinted = signal(false);
  readonly printError = signal<string | null>(null);

  /** Session Stripe Checkout en attente (variant QR — voir startQrCheckout()), null tant qu'elle
   *  n'a pas été créée/tant qu'on n'attend pas de paiement réel. */
  readonly activeCheckout = signal<KioskCheckout | null>(null);

  /** Code promo (voir DiscountCalculator côté API) — même pattern que pos-vente.ts/order-builder.ts. */
  readonly discountCodeInput = signal('');
  readonly appliedDiscount = signal<ValidateDiscountResponse | null>(null);
  readonly discountError = signal<string | null>(null);
  readonly checkingDiscount = signal(false);

  /** "Connexion" client optionnelle (voir Readme.md — programme de fidélité), absente du kiosque
   *  jusqu'ici (client_id était toujours envoyé à null). Contrairement à pos-vente.ts (recherche
   *  libre + liste, outil interne staff), le kiosque est un appareil public : pas de liste
   *  affichant les noms d'autres clients, juste une correspondance exacte par téléphone (voir
   *  KioskService::lookupClientByPhone) — trouvé -> sélectionné directement, sinon -> proposition
   *  de créer un compte avec ce numéro. */
  readonly clientPhoneInput = signal('');
  readonly lookingUpClient = signal(false);
  readonly clientLookupError = signal<string | null>(null);
  readonly selectedClient = signal<Client | null>(null);
  readonly showNewClientForm = signal(false);
  readonly newClientFirstname = signal('');
  readonly newClientLastname = signal('');
  readonly newClientPhone = signal('');
  readonly savingClient = signal(false);

  /** Points fidélité à utiliser en réduction (voir App\Support\LoyaltyPoints côté API) — même
   *  pattern que pos-vente.ts::setPointsToRedeem. */
  readonly pointsToRedeemInput = signal(0);

  /** Variant "Terminal" (simulé, voir confirmSimulatedPayment()). */
  readonly bancontactMethod = computed(() => this.paymentMethods().find((method) => method.slug === 'bancontact') ?? null);
  /** Variant "QR code" (paiement Stripe réel, voir startQrCheckout()) — distinct de Bancontact
   *  côté ERP pour pouvoir reconnaître/réconcilier séparément les deux variants dans les rapports
   *  de caisse (voir StripeWebhookController::markPaid côté API), même si les deux passent par
   *  Bancontact au sens du réseau bancaire. */
  readonly qrCodeMethod = computed(() => this.paymentMethods().find((method) => method.slug === 'qr-code') ?? null);

  readonly availableProducts = computed(() => {
    const catalogIds = this.activeCatalogIds();
    if (catalogIds.length === 0) return [];
    return this.allProducts().filter((product) => product.active && (product.catalogs ?? []).some((catalog) => catalogIds.includes(catalog.id)));
  });

  readonly categories = computed<CategoryFilter[]>(() => {
    const byId = new Map<number | null, CategoryFilter>();
    for (const product of this.availableProducts()) {
      const category = product.category ?? null;
      const key = category?.id ?? null;
      const existing = byId.get(key);
      if (existing) existing.count++;
      else
        byId.set(key, {
          id: key,
          name: category?.name ?? 'Autres',
          count: 1,
          icon: category?.icon ?? null,
          image_url: category?.image_url ?? null,
          position: category?.position ?? Number.MAX_SAFE_INTEGER,
        });
    }
    return Array.from(byId.values()).sort((a, b) => a.position - b.position);
  });

  /** Tous les produits disponibles, groupés par catégorie (même ordre que `categories`) — la
   *  grille ne filtre plus par catégorie sélectionnée (retour utilisateur : afficher tout le menu
   *  d'un coup), la pastille tapée ne fait plus que défiler jusqu'à sa section (voir
   *  scrollToCategory ci-dessous). */
  readonly groupedCategories = computed(() => {
    const products = this.availableProducts();
    return this.categories().map((category) => ({
      category,
      products: products.filter((product) => (product.category?.id ?? null) === category.id),
    }));
  });

  readonly cartTotal = computed(() => this.cart().reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0));
  /** Nombre d'articles (pas de lignes) — affiché sur la barre panier repliée, voir kiosk-order.html. */
  readonly cartCount = computed(() => this.cart().reduce((sum, line) => sum + line.quantity, 0));

  readonly discountAmount = computed(() => this.appliedDiscount()?.amount_off ?? 0);

  /** Conversion fixe points→€ (100 points = 5€, voir App\Support\LoyaltyPoints::EUR_PER_POINT
   *  côté API) — même pattern que pos-vente.ts. */
  readonly pointsAmount = computed(() => Math.round(this.pointsToRedeemInput() * 0.05 * 100) / 100);

  /** Total réellement dû après réduction (promo ET points, cumulables) — le serveur recalcule
   *  indépendamment au moment du paiement (voir KioskOrderController::store) ; ceci ne sert qu'à
   *  l'affichage. */
  readonly payableTotal = computed(() =>
    Math.max(Math.round((this.cartTotal() - this.discountAmount() - this.pointsAmount()) * 100) / 100, 0),
  );

  ngOnInit(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    forkJoin({
      products: this.kioskService.listProducts(),
      catalogs: this.kioskService.listCatalogs(),
      paymentMethods: this.kioskService.listPaymentMethods(),
      session: this.kioskService.activeCashSession(userId),
      config: this.kioskService.getConfig(),
      banners: this.kioskService.listBanners(),
    }).subscribe({
      next: ({ products, catalogs, paymentMethods, session, config, banners }) => {
        if (!session) {
          this.router.navigateByUrl('/setup');
          return;
        }
        this.cashSessionId = session.id;
        this.allProducts.set(products);
        this.paymentMethods.set(paymentMethods);
        this.activeCatalogIds.set(catalogs.filter((catalog) => catalog.active_kiosk).map((catalog) => catalog.id));
        this.tableNumberEnabled.set(config.table_number_enabled);
        this.banners.set(banners);
        this.startBannerCarousel();
        this.loading.set(false);
        if (this.activeCatalogIds().length === 0) {
          this.loadError.set('Aucun catalogue disponible pour le moment — contactez le personnel.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Impossible de charger le menu — réessayez dans un instant.');
      },
    });
  }

  productEmoji(product: Product): string {
    const categoryId = product.category?.id ?? product.id;
    return PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  /** Icône de la sidebar catégories — même logique que productEmoji() (stable par id), 🍽️ pour
   *  "Tout"/catégories sans id ("Autres"), pour rester cohérent visuellement avec les vignettes
   *  produit de la même catégorie. */
  categoryEmoji(categoryId: number | null): string {
    return categoryId === null ? '🍽️' : PRODUCT_EMOJIS[categoryId % PRODUCT_EMOJIS.length];
  }

  formatMoney(value: number | string): string {
    return Number(value).toFixed(2) + ' €';
  }

  lineTotal(line: CartLine): number {
    return Number(line.product.price) * line.quantity;
  }

  /** Somme sur TOUTES les lignes de ce produit — un menu peut désormais apparaître dans plusieurs
   *  lignes distinctes (choix différents, voir CartLine.lineId). */
  quantityInCart(product: Product): number {
    return this.cart()
      .filter((line) => line.product.id === product.id)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  /** `null` = stock non suivi, jamais affiché/décompté — voir pos-vente.ts côté erp-app, même
   *  principe. Mis à jour en temps réel par ProductStockEchoService (voir constructor()) à
   *  chaque vente ou réapprovisionnement, sur ce kiosque comme sur n'importe quel autre poste. */
  remainingStock(product: Product): number | null {
    return product.stock_quantity === null ? null : product.stock_quantity - this.quantityInCart(product);
  }

  isOutOfStock(product: Product): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining <= 0;
  }

  /** Repère visuel (couleur d'alerte) en dessous de ce seuil — purement visuel. */
  isLowStock(product: Product): boolean {
    const remaining = this.remainingStock(product);
    return remaining !== null && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD;
  }

  addToCart(product: Product): void {
    if (this.isOutOfStock(product)) {
      return;
    }

    if (product.is_menu) {
      this.openMenuModal(product);
      return;
    }

    if (this.hasRemovableIngredients(product)) {
      this.openIngredientsModal(product);
      return;
    }

    this.addLineToCart(product, null, 1);
  }

  /** Ajoute (ou fusionne avec) une ligne — factorisé entre addToCart() (pas de personnalisation)
   *  et confirmAddIngredients() (voir ci-dessous), les deux devant fusionner à l'identique par
   *  (product, note), pas seulement product : "Burger" et "Burger — Sans oignon" doivent rester
   *  deux lignes distinctes, jamais fusionnées silencieusement. */
  private addLineToCart(product: Product, note: string | null, quantity: number): void {
    const current = this.cart();
    const existing = current.find((line) => line.product.id === product.id && !line.menuChoices && (line.note ?? null) === note);
    if (existing) {
      this.cart.set(current.map((line) => (line.lineId === existing.lineId ? { ...line, quantity: line.quantity + quantity } : line)));
    } else {
      this.cart.set([...current, { lineId: this.nextCartLineId++, product, quantity, note }]);
    }
  }

  private hasRemovableIngredients(product: Product): boolean {
    return (product.ingredients ?? []).some((ingredient) => ingredient.pivot.removable);
  }

  // --- Modale de personnalisation (voir Product.ingredients) ---

  openIngredientsModal(product: Product): void {
    this.showIngredientsModal.set(product);
    this.excludedIngredientIds.set(new Set());
    this.ingredientsQuantity.set(1);
  }

  closeIngredientsModal(): void {
    this.showIngredientsModal.set(null);
    this.excludedIngredientIds.set(new Set());
    this.ingredientsQuantity.set(1);
  }

  isIngredientExcluded(ingredientId: number): boolean {
    return this.excludedIngredientIds().has(ingredientId);
  }

  toggleExcludedIngredient(ingredientId: number): void {
    const next = new Set(this.excludedIngredientIds());
    if (next.has(ingredientId)) {
      next.delete(ingredientId);
    } else {
      next.add(ingredientId);
    }
    this.excludedIngredientIds.set(next);
  }

  setIngredientsQuantity(value: number): void {
    this.ingredientsQuantity.set(Math.max(1, Math.floor(value) || 1));
  }

  /** Résumé texte de la personnalisation en cours — affiché dans la modale ET utilisé comme note
   *  de ligne (voir confirmAddIngredients()). Vide si rien n'est décoché. */
  ingredientsNotePreview(): string {
    const product = this.showIngredientsModal();
    if (!product) {
      return '';
    }
    const excluded = this.excludedIngredientIds();
    const names = (product.ingredients ?? []).filter((i) => excluded.has(i.id)).map((i) => `Sans ${i.name}`);
    return names.join(', ');
  }

  confirmAddIngredients(): void {
    const product = this.showIngredientsModal();
    if (!product) {
      return;
    }

    const note = this.ingredientsNotePreview() || null;
    this.addLineToCart(product, note, this.ingredientsQuantity());
    this.closeIngredientsModal();
  }

  incrementCartLine(lineId: number): void {
    const current = this.cart();
    const existing = current.find((line) => line.lineId === lineId);
    if (!existing || this.isOutOfStock(existing.product)) return;
    this.cart.set(current.map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity + 1 } : line)));
  }

  decrementCartLine(lineId: number): void {
    const current = this.cart();
    const existing = current.find((line) => line.lineId === lineId);
    if (!existing) return;
    this.cart.set(
      existing.quantity <= 1
        ? current.filter((line) => line.lineId !== lineId)
        : current.map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity - 1 } : line)),
    );
  }

  removeCartLine(lineId: number): void {
    this.cart.set(this.cart().filter((line) => line.lineId !== lineId));
  }

  // --- Menu à choix ---

  openMenuModal(product: Product): void {
    this.showMenuModal.set(product);
    this.menuSelections.set(new Map((product.menu_groups ?? []).map((group) => [group.id, []])));
    this.menuQuantity.set(1);
    this.menuOptionExclusions.set(new Map());
  }

  closeMenuModal(): void {
    this.showMenuModal.set(null);
    this.menuSelections.set(new Map());
    this.menuQuantity.set(1);
    this.menuOptionExclusions.set(new Map());
  }

  setMenuQuantity(value: number): void {
    this.menuQuantity.set(Math.max(1, Math.floor(value) || 1));
  }

  menuGroupSelection(groupId: number): number[] {
    return this.menuSelections().get(groupId) ?? [];
  }

  isMenuOptionSelected(groupId: number, productId: number): boolean {
    return this.menuGroupSelection(groupId).includes(productId);
  }

  toggleMenuOption(group: MenuGroup, productId: number): void {
    const current = this.menuGroupSelection(group.id);
    const next = new Map(this.menuSelections());

    if (group.max_choices === 1) {
      // Re-cliquer l'option déjà sélectionnée d'un groupe obligatoire (min_choices >= 1) ne fait
      // rien — jamais de désélection accidentelle (double-tap tactile notamment, voir bug
      // "reçu : 0" côté App\Support\MenuResolver). Un groupe facultatif (min_choices === 0) peut,
      // lui, repasser à vide.
      if (!current.includes(productId)) {
        next.set(group.id, [productId]);
      } else if (group.min_choices === 0) {
        next.set(group.id, []);
      } else {
        return;
      }
    } else if (current.includes(productId)) {
      next.set(group.id, current.filter((id) => id !== productId));
    } else if (current.length < group.max_choices) {
      next.set(group.id, [...current, productId]);
    } else {
      return;
    }

    this.menuSelections.set(next);
  }

  isMenuGroupValid(group: MenuGroup): boolean {
    const count = this.menuGroupSelection(group.id).length;
    return count >= group.min_choices && count <= group.max_choices;
  }

  // --- Personnalisation d'un produit choisi À L'INTÉRIEUR d'un menu (ex. "le burger pris comme
  // plat, sans oignon") — modale imbriquée dans la modale menu, même mécanique que
  // showIngredientsModal mais sur une option de groupe plutôt qu'une ligne de panier. ---

  private menuOptionKey(groupId: number, productId: number): string {
    return `${groupId}:${productId}`;
  }

  optionHasRemovableIngredients(option: MenuOption): boolean {
    return (option.ingredients ?? []).some((ingredient) => ingredient.pivot.removable);
  }

  openMenuOptionIngredientsModal(group: MenuGroup, option: MenuOption): void {
    this.showMenuOptionIngredientsModal.set({ group, product: option });
    this.menuOptionExcludedIngredientIds.set(new Set(this.menuOptionExclusions().get(this.menuOptionKey(group.id, option.id)) ?? []));
  }

  closeMenuOptionIngredientsModal(): void {
    this.showMenuOptionIngredientsModal.set(null);
    this.menuOptionExcludedIngredientIds.set(new Set());
  }

  isMenuOptionIngredientExcluded(ingredientId: number): boolean {
    return this.menuOptionExcludedIngredientIds().has(ingredientId);
  }

  toggleMenuOptionExcludedIngredient(ingredientId: number): void {
    const next = new Set(this.menuOptionExcludedIngredientIds());
    if (next.has(ingredientId)) {
      next.delete(ingredientId);
    } else {
      next.add(ingredientId);
    }
    this.menuOptionExcludedIngredientIds.set(next);
  }

  menuOptionNotePreview(): string {
    const current = this.showMenuOptionIngredientsModal();
    if (!current) return '';
    const excluded = this.menuOptionExcludedIngredientIds();
    return (current.product.ingredients ?? [])
      .filter((ingredient) => excluded.has(ingredient.id))
      .map((ingredient) => `Sans ${ingredient.name}`)
      .join(', ');
  }

  confirmMenuOptionIngredients(): void {
    const current = this.showMenuOptionIngredientsModal();
    if (!current) return;

    const key = this.menuOptionKey(current.group.id, current.product.id);
    const next = new Map(this.menuOptionExclusions());
    if (this.menuOptionExcludedIngredientIds().size > 0) {
      next.set(key, new Set(this.menuOptionExcludedIngredientIds()));
    } else {
      next.delete(key);
    }
    this.menuOptionExclusions.set(next);
    this.closeMenuOptionIngredientsModal();
  }

  /** Résumé texte ("Sans oignon") de la personnalisation déjà enregistrée pour cette option —
   *  affiché sous sa pastille dans la modale menu, et réutilisé comme note de ligne côté serveur
   *  (voir confirmAddMenu() et App\Support\MenuResolver::resolve). */
  menuOptionNoteFor(groupId: number, productId: number): string {
    const excluded = this.menuOptionExclusions().get(this.menuOptionKey(groupId, productId));
    if (!excluded || excluded.size === 0) return '';
    const group = (this.showMenuModal()?.menu_groups ?? []).find((g) => g.id === groupId);
    const option = group?.options.find((o) => o.id === productId);
    return (option?.ingredients ?? [])
      .filter((ingredient) => excluded.has(ingredient.id))
      .map((ingredient) => `Sans ${ingredient.name}`)
      .join(', ');
  }

  confirmAddMenu(): void {
    const product = this.showMenuModal();
    if (!product || !this.canConfirmMenu()) return;

    const menuChoices: MenuChoice[] = Array.from(this.menuSelections().entries()).map(([menu_group_id, product_ids]) => {
      const product_notes: MenuChoiceProductNote[] = product_ids
        .map((product_id) => ({ product_id, note: this.menuOptionNoteFor(menu_group_id, product_id) }))
        .filter((entry) => entry.note !== '');
      return product_notes.length > 0 ? { menu_group_id, product_ids, product_notes } : { menu_group_id, product_ids };
    });

    const current = this.cart();
    const existing = current.find(
      (line) => line.product.id === product.id && JSON.stringify(line.menuChoices) === JSON.stringify(menuChoices),
    );

    if (existing) {
      this.cart.set(
        current.map((line) => (line.lineId === existing.lineId ? { ...line, quantity: line.quantity + this.menuQuantity() } : line)),
      );
    } else {
      this.cart.set([...current, { lineId: this.nextCartLineId++, product, quantity: this.menuQuantity(), menuChoices }]);
    }

    this.closeMenuModal();
  }

  /** Résumé lisible des choix d'une ligne de menu — même contenu que la note générée côté
   *  serveur (voir MenuResolver::resolve). */
  menuChoiceSummary(line: CartLine): string {
    if (!line.menuChoices) return '';
    const groups = line.product.menu_groups ?? [];
    return line.menuChoices
      .map((choice) => {
        const group = groups.find((g) => g.id === choice.menu_group_id);
        if (!group) return '';
        const names = choice.product_ids
          .map((id) => group.options.find((option) => option.id === id)?.name)
          .filter((name): name is string => !!name);
        return names.length ? `${group.label} : ${names.join(', ')}` : '';
      })
      .filter(Boolean)
      .join(' — ');
  }

  // --- Écran "sur place / à emporter" + clavier numérique (voir orderContextReady/
  // kiosk-order.html) — affiché avant l'accueil quand kiosk_table_available est activé. ---

  chooseDiningMode(mode: DiningMode): void {
    this.diningMode.set(mode);
  }

  /** "← Retour" depuis le clavier numérique — repart du choix sur place/à emporter, pas de
   *  numéro à moitié saisi conservé en mémoire. */
  backToDiningChoice(): void {
    this.diningMode.set(null);
    this.tableNumberInput.set('');
    this.tableNumberConfirmed.set(false);
  }

  pressTableDigit(digit: string): void {
    if (this.tableNumberInput().length >= MAX_TABLE_NUMBER_LENGTH) return;
    this.tableNumberInput.set(this.tableNumberInput() + digit);
  }

  backspaceTableNumber(): void {
    this.tableNumberInput.set(this.tableNumberInput().slice(0, -1));
  }

  clearTableNumber(): void {
    this.tableNumberInput.set('');
  }

  confirmTableNumber(): void {
    if (!this.tableNumberInput()) return;
    this.tableNumberConfirmed.set(true);
  }

  /** Identifiant d'ancre DOM d'une section catégorie — categoryId est null pour le bucket
   *  "Autres" (produits sans catégorie), voir `categories`/`groupedCategories` computed. */
  categoryAnchorId(categoryId: number | null): string {
    return `kiosk-category-${categoryId ?? 'other'}`;
  }

  /** Tuile catégorie de l'accueil OU pastille de la barre de nav (kiosk-category-strip) — les
   *  deux ne font plus que défiler jusqu'à la bonne section : tous les produits restent affichés
   *  en permanence (voir groupedCategories), il n'y a plus de filtrage par catégorie. Depuis
   *  l'accueil, la section n'existe pas encore dans le DOM tant que homeScreen n'est pas repassé à
   *  false — d'où le setTimeout, le temps qu'Angular rende l'écran de navigation. */
  scrollToCategory(categoryId: number | null): void {
    const wasHome = this.homeScreen();
    this.selectedCategoryId.set(categoryId);
    this.homeScreen.set(false);

    this.scrollSpyMuted = true;
    setTimeout(() => (this.scrollSpyMuted = false), 600);

    const scroll = () =>
      document.getElementById(this.categoryAnchorId(categoryId))?.scrollIntoView({ behavior: wasHome ? 'auto' : 'smooth', block: 'start' });

    if (wasHome) {
      setTimeout(scroll, 0);
    } else {
      scroll();
    }
  }

  goHome(): void {
    this.homeScreen.set(true);
    this.selectedCategoryId.set(null);
  }

  toggleCartDrawer(): void {
    this.cartDrawerOpen.set(!this.cartDrawerOpen());
  }

  openPaymentModal(): void {
    if (this.cart().length === 0) return;
    this.paymentError.set(null);
    this.showPaymentModal.set(true);
    this.cartDrawerOpen.set(false);
  }

  closePaymentModal(): void {
    this.stopWaitingForPayment();
    this.showPaymentModal.set(false);
    this.simulatingVariant.set(null);
    this.paymentError.set(null);
    this.appliedDiscount.set(null);
    this.discountCodeInput.set('');
    this.discountError.set(null);
    this.clearClient();
  }

  applyDiscountCode(): void {
    const code = this.discountCodeInput().trim().toUpperCase();
    if (!code || this.checkingDiscount()) {
      return;
    }

    this.checkingDiscount.set(true);
    this.discountError.set(null);

    this.kioskService
      .validateDiscount(
        code,
        this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
      )
      .subscribe({
        next: (result) => {
          this.checkingDiscount.set(false);
          this.appliedDiscount.set(result);
        },
        error: (err) => {
          this.checkingDiscount.set(false);
          this.appliedDiscount.set(null);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.discountError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? 'Code invalide.');
        },
      });
  }

  removeDiscount(): void {
    this.appliedDiscount.set(null);
    this.discountCodeInput.set('');
    this.discountError.set(null);
  }

  // --- Client ("connexion" par téléphone, voir docblock du signal clientPhoneInput) ---

  lookupClient(): void {
    const phone = this.clientPhoneInput().trim();
    if (!phone || this.lookingUpClient()) {
      return;
    }

    this.lookingUpClient.set(true);
    this.clientLookupError.set(null);

    this.kioskService.lookupClientByPhone(phone).subscribe({
      next: (client) => {
        this.lookingUpClient.set(false);
        if (client) {
          this.selectClient(client);
        } else {
          // Création de compte désactivée pour l'instant sur le kiosque (retour utilisateur) —
          // simple message, plus d'ouverture auto du formulaire (voir kiosk-order.html).
          this.clientLookupError.set('Aucun client trouvé avec ce numéro.');
        }
      },
      error: () => {
        this.lookingUpClient.set(false);
        this.clientLookupError.set('Impossible de rechercher ce numéro — réessayez.');
      },
    });
  }

  selectClient(client: Client): void {
    this.selectedClient.set(client);
    this.clientPhoneInput.set('');
    this.clientLookupError.set(null);
    this.showNewClientForm.set(false);
    this.pointsToRedeemInput.set(0);
  }

  clearClient(): void {
    this.selectedClient.set(null);
    this.pointsToRedeemInput.set(0);
    this.clientPhoneInput.set('');
    this.clientLookupError.set(null);
    this.showNewClientForm.set(false);
  }

  toggleNewClientForm(): void {
    this.showNewClientForm.set(!this.showNewClientForm());
  }

  submitNewClient(): void {
    if (!this.newClientFirstname().trim() || !this.newClientLastname().trim()) {
      return;
    }

    this.savingClient.set(true);
    this.kioskService
      .createClient({
        firstname: this.newClientFirstname().trim(),
        lastname: this.newClientLastname().trim(),
        phone: this.newClientPhone().trim() || undefined,
      })
      .subscribe({
        next: (client) => {
          this.savingClient.set(false);
          this.newClientFirstname.set('');
          this.newClientLastname.set('');
          this.newClientPhone.set('');
          this.selectClient(client);
        },
        error: () => this.savingClient.set(false),
      });
  }

  /** Plafonne la saisie au solde du client sélectionné — le serveur revalide de toute façon
   *  (voir App\Support\LoyaltyPoints::amountOff côté API). */
  setPointsToRedeem(value: number): void {
    const balance = this.selectedClient()?.points_balance ?? 0;
    this.pointsToRedeemInput.set(Math.max(0, Math.min(Math.floor(value) || 0, balance)));
  }

  choosePaymentVariant(variant: PaymentVariant): void {
    if (variant === 'qr' && !this.qrCodeMethod()) {
      this.paymentError.set('Aucun moyen de paiement QR Code configuré — contactez le personnel.');
      return;
    }
    if (variant === 'terminal' && !this.bancontactMethod()) {
      this.paymentError.set('Aucun moyen de paiement Bancontact configuré — contactez le personnel.');
      return;
    }
    this.paymentError.set(null);
    this.simulatingVariant.set(variant);
    if (variant === 'qr') {
      this.startQrCheckout();
    }
  }

  cancelSimulatedPayment(): void {
    this.stopWaitingForPayment();
    this.simulatingVariant.set(null);
  }

  /** Crée la session Stripe Checkout (voir KioskCheckoutController) et affiche son QR — le
   *  paiement lui-même se passe sur le téléphone du client, hors de cet écran (voir
   *  refreshCheckoutStatus()/kioskPaymentEcho pour la suite, contrairement au variant terminal qui
   *  reste, lui, entièrement simulé sur ce même écran). */
  private startQrCheckout(): void {
    this.activeCheckout.set(null);

    this.kioskService
      .createKioskCheckout({
        client_id: this.selectedClient()?.id ?? null,
        cash_session_id: this.cashSessionId,
        discount_code: this.appliedDiscount()?.discount.code ?? null,
        points_redeemed: this.pointsToRedeemInput() > 0 ? this.pointsToRedeemInput() : null,
        table_number: this.diningMode() === 'dine_in' ? this.tableNumberInput() : null,
        lines: this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity, note: line.note, menu_choices: line.menuChoices })),
      })
      .subscribe({
        next: (checkout) => {
          this.activeCheckout.set(checkout);
          this.kioskPaymentEcho.listen(checkout.id);
          this.checkoutPollHandle = setInterval(() => this.refreshCheckoutStatus(), KioskOrder.CHECKOUT_POLL_INTERVAL_MS);
        },
        error: (err) => {
          this.simulatingVariant.set(null);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.paymentError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? 'Impossible de générer le QR code.');
        },
      });
  }

  /** Source de vérité unique pour l'état d'un checkout en attente — appelée à la fois par le
   *  polling de secours et par le handler des events temps réel (voir constructor()) : jamais de
   *  confiance dans le payload d'un event, toujours un GET frais (voir docblock de
   *  KioskCheckoutPaid côté API, même principe que le reste de l'app : refetch après mutation). */
  private refreshCheckoutStatus(): void {
    const checkout = this.activeCheckout();
    if (!checkout) return;

    this.kioskService.getKioskCheckout(checkout.id).subscribe({
      next: (state) => this.applyCheckoutState(checkout.id, state),
      // Hoquet réseau transitoire — le prochain tick de polling (ou le prochain event) réessaiera.
      error: () => {},
    });
  }

  private applyCheckoutState(checkoutId: number, state: KioskCheckoutState): void {
    // Le checkout a été annulé/remplacé entre le déclenchement de la requête et sa réponse (ex.
    // "← Retour" cliqué entre-temps) — une réponse en retard ne doit plus rien changer à l'écran.
    if (this.activeCheckout()?.id !== checkoutId) return;

    if (state.status === 'paid' && state.ticket) {
      // closePaymentModal() appelle déjà stopWaitingForPayment() — voir sa définition.
      this.closePaymentModal();
      this.cart.set([]);
      this.paidTicket.set(state.ticket);
      this.newOrderTimeout = setTimeout(() => this.newOrder(), KioskOrder.NEW_ORDER_DELAY_MS);
    } else if (state.status === 'failed' || state.status === 'expired') {
      this.stopWaitingForPayment();
      this.simulatingVariant.set(null);
      this.paymentError.set('Le paiement a échoué ou le QR code a expiré — réessayez.');
    }
    // 'pending' : rien à faire, on continue d'attendre (prochain event ou prochain tick de polling).
  }

  private stopWaitingForPayment(): void {
    this.kioskPaymentEcho.stopListening();
    if (this.checkoutPollHandle !== null) {
      clearInterval(this.checkoutPollHandle);
      this.checkoutPollHandle = null;
    }
    this.activeCheckout.set(null);
  }

  terminalMessage(variant: PaymentVariant): string {
    return variant === 'qr'
      ? 'Scannez le QR code Bancontact avec votre application bancaire.'
      : 'Présentez ou insérez votre carte Bancontact sur le terminal.';
  }

  /** Valide la simulation ET encaisse dans la foulée — un seul moyen possible, pas de paiement
   *  fractionné à composer avant de "Valider" (voir docblock de classe). */
  confirmSimulatedPayment(): void {
    const method = this.bancontactMethod();
    if (!method || this.submitting()) return;

    this.submitting.set(true);
    this.paymentError.set(null);

    this.kioskService
      .createKioskOrder({
        client_id: this.selectedClient()?.id ?? null,
        cash_session_id: this.cashSessionId,
        discount_code: this.appliedDiscount()?.discount.code ?? null,
        points_redeemed: this.pointsToRedeemInput() > 0 ? this.pointsToRedeemInput() : null,
        table_number: this.diningMode() === 'dine_in' ? this.tableNumberInput() : null,
        lines: this.cart().map((line) => ({ product_id: line.product.id, quantity: line.quantity, note: line.note, menu_choices: line.menuChoices })),
        payments: [{ payment_method_id: method.id, value: this.payableTotal() }],
      })
      .subscribe({
        next: (ticket) => {
          this.submitting.set(false);
          this.closePaymentModal();
          this.cart.set([]);
          this.paidTicket.set(ticket);
          this.newOrderTimeout = setTimeout(() => this.newOrder(), KioskOrder.NEW_ORDER_DELAY_MS);
        },
        error: (err) => {
          this.submitting.set(false);
          const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
          this.paymentError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'enregistrer la vente.");
        },
      });
  }

  /** Envoie directement à l'imprimante thermique (voir KioskService::printThermal / App\Support\
   *  ThermalReceipt côté API) plutôt que window.print() — un kiosque n'a pas d'écran de dialogue
   *  d'impression navigateur à proposer à un client, contrairement à un poste POS surveillé par
   *  un membre du staff. */
  printTicket(): void {
    const ticket = this.paidTicket();
    if (!ticket || this.printingThermal()) return;

    this.printingThermal.set(true);
    this.printError.set(null);

    this.kioskService.printThermal(ticket.id, this.activePrinterService.printer()?.id).subscribe({
      next: () => {
        this.printingThermal.set(false);
        this.thermalPrinted.set(true);
      },
      error: (err) => {
        this.printingThermal.set(false);
        const messages = err.error?.errors ? Object.values(err.error.errors).flat() : null;
        this.printError.set((messages?.length ? messages.join(' ') : err.error?.message) ?? "Impossible d'imprimer sur l'imprimante thermique.");
      },
    });
  }

  /** Le client suivant repart d'un panier vide — déclenché soit manuellement, soit
   *  automatiquement 5s après le paiement (voir confirmSimulatedPayment()). Annule le timer dans
   *  les deux cas : un clic manuel avant l'échéance ne doit pas redéclencher un second reset
   *  derrière. */
  newOrder(): void {
    if (this.newOrderTimeout !== null) {
      clearTimeout(this.newOrderTimeout);
      this.newOrderTimeout = null;
    }
    this.paidTicket.set(null);
    this.appliedDiscount.set(null);
    this.discountCodeInput.set('');
    this.discountError.set(null);
    this.thermalPrinted.set(false);
    this.printError.set(null);
    this.homeScreen.set(true);
    this.selectedCategoryId.set(null);
    this.cartDrawerOpen.set(false);
    this.diningMode.set(null);
    this.tableNumberInput.set('');
    this.tableNumberConfirmed.set(false);
  }

  /** (Re)démarre l'avance automatique du carrousel hero — appelée au chargement initial et à
   *  chaque tap sur une pastille (goToBannerSlide) pour repartir sur un intervalle complet plutôt
   *  que de changer de slide juste après un choix manuel. Pas de rotation avec 0 ou 1 bannière. */
  private startBannerCarousel(): void {
    if (this.bannerInterval !== null) {
      clearInterval(this.bannerInterval);
      this.bannerInterval = null;
    }

    if (this.visibleBanners().length <= 1) return;

    this.bannerInterval = setInterval(() => {
      this.activeBannerIndex.set((this.activeBannerIndex() + 1) % this.visibleBanners().length);
    }, KioskOrder.BANNER_INTERVAL_MS);
  }

  goToBannerSlide(index: number): void {
    this.activeBannerIndex.set(index);
    this.startBannerCarousel();
  }

  goToSetup(): void {
    this.router.navigateByUrl('/setup');
  }

  ngOnDestroy(): void {
    if (this.bannerInterval !== null) {
      clearInterval(this.bannerInterval);
    }
    if (this.newOrderTimeout !== null) {
      clearTimeout(this.newOrderTimeout);
    }
    // kioskPaymentEcho est fourni en root (singleton) — sans ça, un checkout resterait
    // "écouté" côté websocket même après avoir quitté cet écran (ex. goToSetup()).
    this.stopWaitingForPayment();
  }
}
