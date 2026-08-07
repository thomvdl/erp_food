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
import { Order, OrderSection, Passe, Station } from '../../core/models/order.model';

/**
 * Un seul filtre actif à la fois, parmi 5 choix mutuellement exclusifs (voir Readme.md : "on
 * doit pouvoir sélectionner Tout ou tous les postes ou toutes les stations") :
 * - null              : "Tout" — aucune restriction.
 * - all-stations       : "Tous les postes" — aucune restriction non plus, mais reste dans le
 *   groupe "Postes" (déclenche quand même la règle "section prête retirée de la vue Poste").
 * - { station, id }    : un poste précis.
 * - all-passes         : "Tous les passes" — aucune restriction, groupe "Passes".
 * - { passe, id }      : un passe précis.
 * Distinguer explicitement ces 5 états (plutôt que de tout confondre sous `null`) évite que
 * plusieurs pastilles de reset s'affichent actives en même temps pour le même état réel —
 * source de confusion signalée par l'utilisateur ("les sélecteurs ne fonctionnent pas bien").
 */
type BoardFilter =
  | null
  | { kind: 'all-stations' }
  | { kind: 'station'; id: number }
  | { kind: 'all-passes' }
  | { kind: 'passe'; id: number };

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

  readonly isDark = this.themeService.isDark;

  readonly orders = signal<Order[]>([]);
  readonly stations = signal<Station[]>([]);
  readonly passes = signal<Passe[]>([]);
  readonly filter = signal<BoardFilter>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

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
            const lineIds =
              stationIds === null
                ? new Set(section.lines.map((l) => l.id))
                : new Set(section.lines.filter((l) => stationIds.has(l.product?.station_id ?? -1)).map((l) => l.id));
            const determiningStationId = section.lines[0]?.product?.station_id ?? null;
            const determiningPasseId = determiningStationId !== null ? (stationsById.get(determiningStationId)?.passe_id ?? null) : null;
            const passe = determiningPasseId !== null ? (passesById.get(determiningPasseId) ?? null) : null;
            return { section, lineIds, passe };
          })
          .filter((displaySection) => displaySection.lineIds.size > 0);

        return { order, sections };
      })
      .filter((displayOrder) => displayOrder.sections.length > 0);
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

    this.kitchenEcho.listen();
    this.kitchenEcho.updated.pipe(takeUntilDestroyed()).subscribe(() => this.refresh());
  }

  selectAll(): void {
    this.filter.set(null);
  }

  selectAllStations(): void {
    this.filter.set({ kind: 'all-stations' });
  }

  selectAllPasses(): void {
    this.filter.set({ kind: 'all-passes' });
  }

  selectStation(id: number): void {
    this.filter.set({ kind: 'station', id });
  }

  selectPasse(id: number): void {
    this.filter.set({ kind: 'passe', id });
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

  markDone(displaySection: DisplaySection): void {
    if (!this.canMarkDone(displaySection)) {
      return;
    }
    this.orderSectionService.marquerFait(displaySection.section.id, Array.from(displaySection.lineIds)).subscribe({
      next: () => this.refresh(),
      error: () => this.error.set('Impossible de marquer ces produits comme faits.'),
    });
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

  send(displaySection: DisplaySection): void {
    if (!this.canSend(displaySection)) {
      return;
    }
    this.orderSectionService.envoyer(displaySection.section.id, Array.from(displaySection.lineIds)).subscribe({
      next: () => this.refresh(),
      error: () => this.error.set('Impossible de marquer ces produits comme envoyés.'),
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
