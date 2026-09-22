import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { OrderService } from '../../core/order.service';
import { OrderSectionService } from '../../core/order-section.service';
import { StationService } from '../../core/station.service';
import { PasseService } from '../../core/passe.service';
import { KitchenEchoService } from '../../core/kitchen-echo.service';
import { ActiveKitchenFilterService } from '../../core/active-kitchen-filter.service';
import { KitchenDisplayConfigService } from '../../core/kitchen-display-config.service';
import { Order, OrderSection, Passe, Station } from '../../core/models/order.model';

/** Voir showSoonOnly()/isDueSoon() — "n'afficher que les commandes à préparer dans les 15
 *  prochaines minutes" (demande explicite). */
const DUE_SOON_MINUTES = 15;

/** Une section filtrée sur le filtre actif — ne garde que les lignes correspondantes. */
interface DisplaySection {
  section: OrderSection;
  lineIds: Set<number>;
  /** Passe correspondant (voir Readme.md : "elle passe par son passe correspondant") — dérivé de la station de sa première ligne. */
  passe: Passe | null;
}

interface DisplayOrder {
  order: Order;
  sections: DisplaySection[];
}

/** Une ligne du récap produits à droite (voir pendingProducts()/activeProducts()) — quantités
 *  cumulées entre toutes les commandes/sections visibles dans le filtre actif, pas juste une
 *  ligne d'une section précise. */
interface PrepListItem {
  productId: number;
  productName: string;
  quantity: number;
}

/** Action en attente de confirmation dans la modale (voir requestMarkDone()/requestSend()) —
 *  "kind" détermine à la fois le libellé de la modale et l'appel API déclenché par confirmAction(). */
interface PendingAction {
  order: Order;
  displaySection: DisplaySection;
  kind: 'done' | 'sent';
}

/**
 * "On doit voir les stations et les passes : Tout - toutes les stations, chacune des différentes
 * stations - tous les passes, chacun des passes" (voir Readme.md) : deux dimensions de filtre
 * indépendantes (par poste de préparation OU par passe d'expédition), plus un "Tout" qui remet à
 * zéro. Un seul filtre actif à la fois (`BoardFilter`) — sélectionner un poste désactive le passe
 * sélectionné et inversement. Dans les deux cas, seules les LIGNES de chaque section sont
 * filtrées (pas les sections entières) sur `product.station_id`, un même plat pouvant mélanger
 * des produits de plusieurs stations (ex. section "Entrées" avec un produit "Froid" et un produit
 * "Chaud") — voir Product.station_id côté backend. Un filtre par passe revient à filtrer par
 * TOUTES les stations qui pointent vers ce passe (`Station.passe_id` — "c'est dans station qu'on
 * doit pouvoir choisir dans quelle passe ça doit aller", plusieurs stations peuvent partager un
 * même passe, voir CONTEXT.md pour l'historique de cette inversion de relation).
 *
 * Cycle d'une section (mêmes noms que orders.state, voir Readme.md et CONTEXT.md pour
 * l'historique de cette correction) : en_attente -> send (valider, erp-app) -> ask (demander en
 * cuisine, erp-app) -> do (marquer faite, ICI) -> seed (envoyer, ICI, section par section — pas
 * besoin d'attendre les autres sections de la commande). "Il n'y a que les stations qui peuvent
 * marquer prête, pas les passes ; les passes ne peuvent qu'envoyer" (voir Readme.md) : séparation
 * stricte des rôles, "Marquer prête" n'apparaît que depuis la perspective "Postes", "Envoyer" que
 * depuis "Passes" (voir `isStationPerspective`/`isPassePerspective`, `canMarkDone`/`canSend`) —
 * "Tout" reste un écran de supervision, sans action possible. "Elle passe par son passe
 * correspondant" : affiché à titre indicatif sur chaque section via `displaySection.passe`.
 */
@Component({
  selector: 'app-kitchen-board',
  standalone: true,
  imports: [],
  templateUrl: './kitchen-board.html',
  styleUrl: './kitchen-board.css',
})
export class KitchenBoard implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly orderSectionService = inject(OrderSectionService);
  private readonly stationService = inject(StationService);
  private readonly passeService = inject(PasseService);
  private readonly kitchenEcho = inject(KitchenEchoService);
  private readonly activeKitchenFilter = inject(ActiveKitchenFilterService);
  private readonly kitchenDisplayConfig = inject(KitchenDisplayConfigService);

  readonly isDark = this.themeService.isDark;

  readonly orders = signal<Order[]>([]);
  readonly stations = signal<Station[]>([]);
  readonly passes = signal<Passe[]>([]);
  /** Choix fait sur l'écran poste-select après connexion (persisté, voir
   *  ActiveKitchenFilterService) — source de vérité unique, pas de copie locale : sélectionner
   *  un filtre depuis la barre ci-dessous (quand elle est visible) persiste donc aussi le choix. */
  readonly filter = this.activeKitchenFilter.filter;
  /** Réglage "kitchen_display_show_filter_bar" (Paramètres > Réglages, voir
   *  KitchenDisplayConfigService) — true par défaut le temps du chargement, pour ne pas faire
   *  disparaître la barre une fraction de seconde sur un poste où elle doit rester affichée. */
  readonly filterBarVisible = signal(true);
  /** Réglage "kitchen_display_skip_passe" (voir KitchenDisplayConfigService) — petits
   *  établissements sans passe dédié : "marquer prête" envoie directement (voir
   *  OrderSectionController::marquerFait côté API), la colonne "Passes" n'a alors plus lieu
   *  d'être proposée (aucune section n'atteint jamais l'état 'do'). false le temps du chargement,
   *  comportement historique inchangé par défaut. */
  readonly skipPasse = signal(false);
  /** "N'afficher que les commandes à préparer dans les 15 prochaines minutes" — option d'affichage
   *  locale (pas persistée, pas un réglage Paramètres : bascule libre en cours de service, voir
   *  isDueSoon()). Toujours proposée, même quand la barre de filtre Postes/Passes ci-dessus est
   *  masquée (voir filterBarVisible) — dimension indépendante, pas liée au choix de poste/passe. */
  readonly showSoonOnly = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Modale de confirmation ("demande explicite") avant "Marquer prête"/"Envoyer" — null = fermée.
   *  Voir requestMarkDone()/requestSend()/confirmAction()/cancelAction(). */
  readonly pendingAction = signal<PendingAction | null>(null);
  readonly confirmingAction = signal(false);

  /** Tick chaque seconde pour recalculer les minuteurs affichés (voir sectionTimer()) — les
   *  commandes elles-mêmes ne se rechargent que sur événement Echo, pas chaque seconde. */
  readonly now = signal(Date.now());
  private readonly nowInterval = setInterval(() => this.now.set(Date.now()), 1000);

  /**
   * Stations couvertes par le filtre actif — null si aucune restriction ("Tout", "Tous les
   * postes" ou "Tous les passes"). Un `Set` (pas un id unique) car un passe peut désormais
   * couvrir PLUSIEURS stations (voir Readme.md : "c'est dans station qu'on doit pouvoir choisir
   * dans quelle passe ça doit aller" — stations.passe_id, plusieurs stations peuvent partager un
   * même passe).
   */
  private readonly filterStationIds = computed<Set<number> | null>(() => {
    const current = this.filter();
    if (current?.kind === 'station') {
      return new Set([current.id]);
    }
    if (current?.kind === 'passe') {
      return new Set(this.stations().filter((station) => station.passe_id === current.id).map((station) => station.id));
    }
    return null;
  });

  /** Vrai si on regarde depuis la perspective "Postes" (précis ou "Tous les postes") — voir la
   *  règle "section prête" plus bas, utilisé aussi pour cantonner "Marquer prête" à cette
   *  perspective (voir canMarkDone) et pour n'afficher le récap produits à droite que pour un
   *  poste (voir showPrepList). */
  readonly isStationPerspective = computed(() => {
    const current = this.filter();
    return current?.kind === 'station' || current?.kind === 'all-stations';
  });

  /**
   * Vrai si on regarde depuis la perspective "Passes" (précis ou "Tous les passes") — "il n'y a
   * que les stations qui peuvent marquer prête, pas les passes ; les passes ne peuvent
   * qu'envoyer" (voir Readme.md) : chaque action reste cantonnée à sa perspective (voir
   * `canMarkDone`/`canSend` plus bas). Depuis "Tout" (aucune perspective précise), aucune des
   * deux actions n'est proposée — un écran de supervision globale n'est pas un poste de travail.
   */
  readonly isPassePerspective = computed(() => {
    const current = this.filter();
    return current?.kind === 'passe' || current?.kind === 'all-passes';
  });

  readonly displayOrders = computed<DisplayOrder[]>(() => {
    const stationPerspective = this.isStationPerspective();
    const stationIds = this.filterStationIds();
    const passesById = new Map(this.passes().map((passe) => [passe.id, passe]));
    const stationsById = new Map(this.stations().map((station) => [station.id, station]));

    return this.orders()
      .map((order) => {
        const sections = order.sections
          // "On met la section en attente que quand on valide la section" (voir Readme.md) —
          // une section 'en_attente' n'est pas encore validée, donc pas encore transférée au
          // kitchen display : filtre défensif, même si le backend ne devrait plus broadcaster
          // avant validation (voir OrderController::store).
          .filter((section) => section.state !== 'en_attente')
          // "Quand j'ajoute une section dans POS - Restaurant et que je valide, ça n'envoie pas
          // dans kitchen display" (bug signalé) : la visibilité se basait sur `order.state`
          // ('seed' une fois TOUTES les sections déjà présentes envoyées), qui reste bloqué à
          // 'seed' quand on ajoute et valide une NOUVELLE section après coup (rien ne "rouvre"
          // l'Order — la table reste occupée, une commande peut recevoir de nouvelles sections
          // à tout moment). Fix : plus aucune dépendance à `order.state` ici, la visibilité se
          // déduit uniquement des sections elles-mêmes — une section 'seed'/'done' a fini tout
          // son cycle kitchen display et disparaît de TOUTES les vues (pas seulement "Postes"),
          // une commande entièrement envoyée disparaît simplement parce qu'il ne lui reste plus
          // aucune section à afficher (voir le dernier .filter ci-dessous).
          .filter((section) => section.state !== 'seed' && section.state !== 'done')
          // "Une fois marquée prête, la section doit passer sur le bon passe correspondant"
          // (voir Readme.md) : dans une vue "Postes" (un poste précis ou "Tous les postes"), une
          // section déjà 'do' a fini son travail pour la cuisine et doit disparaître de sa
          // file — c'est maintenant le passe qui en a la charge (vue "Passes" ou "Tout").
          .filter((section) => !(stationPerspective && section.state === 'do'))
          .map((section) => {
            // Un produit sans station (voir Product.station_id) n'a aucun poste de préparation à
            // qui l'assigner — il ne passe donc jamais par le kitchen display, quelle que soit la
            // vue (y compris "Tout"), pas seulement quand un poste précis est filtré.
            const kitchenLines = section.lines.filter((l) => l.product?.station_id != null);
            const lineIds =
              stationIds === null
                ? new Set(kitchenLines.map((l) => l.id))
                : new Set(kitchenLines.filter((l) => stationIds.has(l.product!.station_id!)).map((l) => l.id));
            const determiningStationId = kitchenLines[0]?.product?.station_id ?? null;
            const determiningPasseId = determiningStationId !== null ? (stationsById.get(determiningStationId)?.passe_id ?? null) : null;
            const passe = determiningPasseId !== null ? (passesById.get(determiningPasseId) ?? null) : null;
            return { section, lineIds, passe };
          })
          .filter((displaySection) => displaySection.lineIds.size > 0);

        return { order, sections };
      })
      .filter((displayOrder) => displayOrder.sections.length > 0)
      .filter((displayOrder) => !this.showSoonOnly() || this.isDueSoon(displayOrder.order));
  });

  /**
   * Récap produits à droite — n'a de sens que pour un poste (voir Readme.md : "il n'y a que les
   * stations qui peuvent marquer prête, pas les passes") : un passe n'a rien à "préparer", donc
   * pas de panneau dans cette perspective (ni pour "Tout", écran de supervision sans action
   * possible) — voir `isStationPerspective()`, utilisé directement dans le template pour
   * conditionner l'affichage du panneau. Basé sur `displayOrders()` (déjà filtré par poste actif),
   * pour rester cohérent avec ce que montre la grille principale.
   */
  readonly topProducts = computed<PrepListItem[]>(() => this.aggregateProducts(['send']));

  readonly bottomProducts = computed<PrepListItem[]>(() => this.aggregateProducts(['ask']));

  private aggregateProducts(states: OrderSection['state'][]): PrepListItem[] {
    const quantities = new Map<number, PrepListItem>();

    for (const displayOrder of this.displayOrders()) {
      for (const displaySection of displayOrder.sections) {
        if (!states.includes(displaySection.section.state)) continue;

        for (const line of displaySection.section.lines) {
          if (!displaySection.lineIds.has(line.id) || !line.product) continue;

          const existing = quantities.get(line.product.id);
          if (existing) {
            existing.quantity += line.quantity;
          } else {
            quantities.set(line.product.id, { productId: line.product.id, productName: line.product.name, quantity: line.quantity });
          }
        }
      }
    }

    return Array.from(quantities.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }

  constructor() {
    this.refresh();
    this.stationService.list().subscribe((stations) => this.stations.set(stations));
    this.passeService.list().subscribe((passes) => this.passes.set(passes));
    this.kitchenDisplayConfig.get().subscribe((config) => {
      this.filterBarVisible.set(config.filter_bar_visible);
      this.skipPasse.set(config.skip_passe);
    });

    this.kitchenEcho.listen();
    this.kitchenEcho.updated.pipe(takeUntilDestroyed()).subscribe(() => this.refresh());
  }

  selectAll(): void {
    this.activeKitchenFilter.setFilter(null);
  }

  selectAllStations(): void {
    this.activeKitchenFilter.setFilter({ kind: 'all-stations' });
  }

  selectAllPasses(): void {
    this.activeKitchenFilter.setFilter({ kind: 'all-passes' });
  }

  selectStation(id: number): void {
    this.activeKitchenFilter.setFilter({ kind: 'station', id });
  }

  selectPasse(id: number): void {
    this.activeKitchenFilter.setFilter({ kind: 'passe', id });
  }

  isAllActive(): boolean {
    return this.filter() === null;
  }

  isAllStationsActive(): boolean {
    return this.filter()?.kind === 'all-stations';
  }

  isAllPassesActive(): boolean {
    return this.filter()?.kind === 'all-passes';
  }

  isStationActive(id: number): boolean {
    const current = this.filter();
    return current?.kind === 'station' && current.id === id;
  }

  isPasseActive(id: number): boolean {
    const current = this.filter();
    return current?.kind === 'passe' && current.id === id;
  }

  sectionStateLabel(state: OrderSection['state']): string {
    return { en_attente: 'En attente', send: 'Validée', ask: 'Demandée', do: 'Prête', seed: 'Envoyée', done: 'Servie' }[state];
  }

  /** Badge affiché à la place du plan de salle pour une commande sans table (voir
   *  kitchen-board.html) — toute commande sans table n'est pas forcément un kiosque (ex.
   *  boutique en ligne, voir Order.source), contrairement à l'ancienne logique qui l'assumait. */
  orderSourceLabel(source: string | null): string {
    switch (source) {
      case 'public_shop':
        return 'Boutique en ligne';
      case 'pos_vente_directe':
        return 'Vente directe';
      case 'kiosk':
      default:
        return 'Kiosque';
    }
  }

  orderSourceIcon(source: string | null): string {
    switch (source) {
      case 'public_shop':
        return '🛍️';
      case 'pos_vente_directe':
        return '🛎️';
      default:
        return '🖥️';
    }
  }

  /** Uniquement pertinent pour la boutique en ligne (voir Order.fulfillment_type) — le kiosque et
   *  le POS Restaurant n'ont pas cette notion, jamais affiché pour eux. */
  orderFulfillmentLabel(order: DisplayOrder['order']): string | null {
    if (order.source !== 'public_shop') return null;
    return order.fulfillment_type === 'delivery' ? '🚚 Livraison' : '🏬 À emporter';
  }

  /** "Commande différée" (boutique en ligne, voir App\Support\ShopOpeningHours côté API) — la
   *  commande apparaît quand même tout de suite ici (pas de report d'affichage), donc affichée en
   *  évidence pour ne pas la confondre avec une commande à préparer immédiatement. Date incluse
   *  seulement si ce n'est pas aujourd'hui (jusqu'à J+5, voir ShopCheckoutController::store). */
  scheduledLabel(order: DisplayOrder['order']): string | null {
    if (!order.scheduled_at) return null;

    const date = new Date(order.scheduled_at);
    const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const isToday = date.toDateString() === new Date().toDateString();

    if (isToday) return `⏰ Prévu à ${time}`;

    const day = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    return `⏰ Prévu le ${day} à ${time}`;
  }

  /** Voir showSoonOnly() — une commande "dès que possible" (scheduled_at null, toutes les
   *  sources sauf boutique en ligne différée) est par nature toujours "à préparer maintenant",
   *  donc toujours incluse. Une commande différée déjà en retard (scheduled_at dépassé) reste
   *  incluse aussi — la sortir du board serait pire qu'une commande en avance qu'on masque. Lit
   *  `this.now()` (tick chaque seconde) pour que le filtre se réévalue tout seul avec le temps,
   *  sans attendre un nouvel événement Echo. */
  private isDueSoon(order: DisplayOrder['order']): boolean {
    if (!order.scheduled_at) return true;

    const minutesUntilDue = (new Date(order.scheduled_at).getTime() - this.now()) / 60_000;
    return minutesUntilDue <= DUE_SOON_MINUTES;
  }

  /**
   * Minuteur de préparation — "afficher un timer quand c'est demandé, avec le temps de
   * préparation" (retour utilisateur). N'a de sens que pendant 'ask' (en cours de préparation,
   * pas encore marquée prête) ; null si la section n'est pas dans cet état, si `asked_at` n'a pas
   * été renseigné (section créée avant la migration), ou si AUCUNE ligne visible ici n'a de
   * `preparation_time` configuré. Le temps de réf. est le MAX des temps de préparation des
   * produits visibles (lignes filtrées par poste/passe actif, voir `displaySection.lineIds`) — on
   * suppose une préparation en parallèle, prête quand le plus long article l'est.
   */
  sectionTimer(displaySection: DisplaySection): { remainingSeconds: number; overdue: boolean } | null {
    const section = displaySection.section;
    if (section.state !== 'ask' || !section.asked_at) {
      return null;
    }

    const prepMinutes = Math.max(
      0,
      ...section.lines.filter((line) => displaySection.lineIds.has(line.id)).map((line) => line.product?.preparation_time ?? 0),
    );
    if (prepMinutes <= 0) {
      return null;
    }

    const elapsedSeconds = Math.floor((this.now() - new Date(section.asked_at).getTime()) / 1000);
    const remainingSeconds = prepMinutes * 60 - elapsedSeconds;
    return { remainingSeconds, overdue: remainingSeconds < 0 };
  }

  formatTimer(remainingSeconds: number): string {
    const totalSeconds = Math.abs(remainingSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return remainingSeconds < 0 ? `+${formatted}` : formatted;
  }

  /**
   * "Fait" (voir Readme.md) : le poste correspondant au produit marque la section comme
   * préparée — mais "uniquement les produits de son propre poste et de son propre passe ; là
   * quand on marque comme fait, ça le fait pour tous les produits de la section" (retour
   * utilisateur) : une section mélangeant plusieurs postes ne doit pas se marquer faite en bloc
   * depuis la vue d'un seul poste. `canMarkDone`/`markDone` opèrent donc sur la `DisplaySection`
   * (lignes déjà filtrées par le poste/passe actif, voir `displayOrders`), pas sur l'`OrderSection`
   * entière — le bouton ne reste actif que s'il reste, PARMI LES LIGNES VISIBLES ICI, au moins
   * une ligne pas encore faite. "Il n'y a que les stations qui peuvent marquer prête, pas les
   * passes" (voir Readme.md) : n'apparaît que depuis la perspective "Postes", jamais "Passes" ni
   * "Tout" — voir `isStationPerspective`.
   */
  canMarkDone(displaySection: DisplaySection): boolean {
    if (!this.isStationPerspective() || displaySection.section.state !== 'ask') {
      return false;
    }
    return displaySection.section.lines.some((line) => displaySection.lineIds.has(line.id) && !line.done);
  }

  /** Ouvre la modale de confirmation — voir confirmAction() pour l'appel API réel, déclenché
   *  seulement après validation ("demande explicite" : éviter un marquage accidentel sur un écran
   *  tactile partagé entre plusieurs commandes affichées côte à côte). */
  requestMarkDone(order: Order, displaySection: DisplaySection): void {
    if (!this.canMarkDone(displaySection)) {
      return;
    }
    this.pendingAction.set({ order, displaySection, kind: 'done' });
  }

  /**
   * "Envoyer" (voir Readme.md) : le passe correspondant marque la section comme expédiée
   * (do -> seed) — mais "pour les passes aussi, quand je valide dans un passe ça valide dans les
   * deux pour la même table et la même section" (retour utilisateur) : une section peut avoir des
   * lignes réparties sur deux passes différents, donc `canSend`/`send` opèrent sur la
   * `DisplaySection` (lignes déjà filtrées par le passe actif), pas sur l'`OrderSection`
   * entière — même principe que `canMarkDone`/`markDone`. "Les passes ne peuvent qu'envoyer"
   * (voir Readme.md) : symétriquement, n'apparaît que depuis la perspective "Passes", jamais
   * "Postes" ni "Tout" — voir `isPassePerspective`.
   */
  canSend(displaySection: DisplaySection): boolean {
    if (!this.isPassePerspective() || displaySection.section.state !== 'do') {
      return false;
    }
    return displaySection.section.lines.some((line) => displaySection.lineIds.has(line.id) && !line.sent);
  }

  /** Voir requestMarkDone() — même principe pour "Envoyer". */
  requestSend(order: Order, displaySection: DisplaySection): void {
    if (!this.canSend(displaySection)) {
      return;
    }
    this.pendingAction.set({ order, displaySection, kind: 'sent' });
  }

  /** Libellé affiché dans la modale de confirmation pour identifier la commande concernée — même
   *  logique que le badge de la carte (table sinon N° de commande). */
  pendingOrderLabel(order: Order): string {
    return order.table ? `Table ${order.table.label}` : `N° ${order.ticket_id}`;
  }

  /** Lignes réellement affectées par l'action en attente — seulement celles visibles dans le
   *  poste/passe actif (displaySection.lineIds) et pas déjà faites/envoyées, pour lister
   *  précisément ce que la confirmation va valider. */
  pendingLines(action: PendingAction): OrderSection['lines'] {
    const doneField = action.kind === 'done' ? 'done' : 'sent';
    return action.displaySection.section.lines.filter(
      (line) => action.displaySection.lineIds.has(line.id) && !line[doneField],
    );
  }

  cancelAction(): void {
    if (this.confirmingAction()) {
      return;
    }
    this.pendingAction.set(null);
  }

  confirmAction(): void {
    const action = this.pendingAction();
    if (!action || this.confirmingAction()) {
      return;
    }

    this.confirmingAction.set(true);
    const lineIds = Array.from(action.displaySection.lineIds);
    const request =
      action.kind === 'done'
        ? this.orderSectionService.marquerFait(action.displaySection.section.id, lineIds)
        : this.orderSectionService.envoyer(action.displaySection.section.id, lineIds);

    request.subscribe({
      next: () => {
        this.confirmingAction.set(false);
        this.pendingAction.set(null);
        this.refresh();
      },
      error: () => {
        this.confirmingAction.set(false);
        this.pendingAction.set(null);
        this.error.set(
          action.kind === 'done' ? 'Impossible de marquer ces produits comme faits.' : 'Impossible de marquer ces produits comme envoyés.',
        );
      },
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  logout(): void {
    this.authService.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }

  private refresh(): void {
    this.orderService.list().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger les commandes.');
      },
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.nowInterval);
  }
}
