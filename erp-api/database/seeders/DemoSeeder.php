<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\CashSession;
use App\Models\Client;
use App\Models\Event;
use App\Models\EventTicket;
use App\Models\PaymentMethod;
use App\Models\ProductCatalog;
use App\Models\ProductCategory;
use App\Models\Product;
use App\Models\Role;
use App\Models\Room;
use App\Models\Station;
use App\Models\TableElement;
use App\Models\Tax;
use App\Models\Ticket;
use App\Models\TicketPayment;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Données fictives — plan de salle, clients, personnel, catalogue produit, events/réservations,
 * tickets — pour ne pas avoir des écrans vides juste après l'installation. Suppose que
 * RoleSeeder/StationSeeder/TaxSeeder/ProductCategorySeeder/ProductCatalogSeeder/
 * PaymentMethodSeeder ont déjà tourné (voir DatabaseSeeder).
 *
 * seedEvents/seedBookings/seedTickets se protègent chacun d'un `->exists()` — contrairement au
 * reste (firstOrCreate par clé métier), ces données n'ont pas de clé naturelle à dédupliquer
 * dessus ; sans ce garde-fou, relancer `db:seed` (l'entrypoint Docker le fait à chaque démarrage
 * de conteneur, voir Readme.md) empilerait de nouveaux tickets/events à l'infini.
 */
class DemoSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->seedStaff();
        $this->seedFloorPlan();
        $this->seedClients();
        $this->seedProducts();
        $this->seedEvents();
        $this->seedBookings();
        $this->seedTickets();
    }

    private function seedStaff(): void
    {
        $superviseur = Role::query()->where('slug', 'superviseur')->first();
        $user = Role::query()->where('slug', 'user')->first();

        $defs = [
            ['username' => 'julie', 'email' => 'julie@erp.local', 'role' => $superviseur],
            ['username' => 'thomas', 'email' => 'thomas@erp.local', 'role' => $superviseur],
            ['username' => 'marc', 'email' => 'marc@erp.local', 'role' => $user],
            ['username' => 'sophie', 'email' => 'sophie@erp.local', 'role' => $user],
            ['username' => 'nathan', 'email' => 'nathan@erp.local', 'role' => $user],
            ['username' => 'chloe', 'email' => 'chloe@erp.local', 'role' => $user],
        ];

        foreach ($defs as $def) {
            $account = User::query()->firstOrCreate(
                ['email' => $def['email']],
                ['username' => $def['username'], 'password' => Hash::make('password')],
            );

            if ($def['role'] && ! $account->roles->contains($def['role']->id)) {
                $account->roles()->attach($def['role']);
            }
        }
    }

    private function seedFloorPlan(): void
    {
        $main = Room::query()->firstOrCreate(['slug' => Str::slug('Salle principale')], ['name' => 'Salle principale']);

        if ($main->tables()->count() === 0) {
            $tables = [
                ['label' => '1', 'pos_left' => 40, 'pos_top' => 60],
                ['label' => '2', 'pos_left' => 180, 'pos_top' => 60],
                ['label' => '3', 'pos_left' => 320, 'pos_top' => 60],
                ['label' => '4', 'pos_left' => 40, 'pos_top' => 200],
                ['label' => '5', 'pos_left' => 180, 'pos_top' => 200],
                ['label' => '6', 'pos_left' => 320, 'pos_top' => 200],
            ];

            foreach ($tables as $table) {
                $main->tables()->create([
                    'type' => 'table',
                    'label' => $table['label'],
                    'pos_left' => $table['pos_left'],
                    'pos_top' => $table['pos_top'],
                    'width' => 80,
                    'height' => 80,
                ]);
            }
        }

        $terrasse = Room::query()->firstOrCreate(['slug' => Str::slug('Terrasse')], ['name' => 'Terrasse']);

        if ($terrasse->tables()->count() === 0) {
            $tables = [
                ['label' => 'T1', 'pos_left' => 40, 'pos_top' => 60],
                ['label' => 'T2', 'pos_left' => 180, 'pos_top' => 60],
                ['label' => 'T3', 'pos_left' => 40, 'pos_top' => 200],
                ['label' => 'T4', 'pos_left' => 180, 'pos_top' => 200],
                ['label' => 'T5', 'pos_left' => 320, 'pos_top' => 60],
                ['label' => 'T6', 'pos_left' => 320, 'pos_top' => 200],
            ];

            foreach ($tables as $table) {
                $terrasse->tables()->create([
                    'type' => 'table',
                    'label' => $table['label'],
                    'pos_left' => $table['pos_left'],
                    'pos_top' => $table['pos_top'],
                    'width' => 80,
                    'height' => 80,
                ]);
            }
        }

        $salleFetes = Room::query()->firstOrCreate(
            ['slug' => Str::slug('Salle des fêtes')],
            ['name' => 'Salle des fêtes', 'type' => 'event'],
        );

        if ($salleFetes->tables()->count() === 0) {
            $tables = [
                ['label' => 'E1', 'pos_left' => 40, 'pos_top' => 60],
                ['label' => 'E2', 'pos_left' => 200, 'pos_top' => 60],
                ['label' => 'E3', 'pos_left' => 360, 'pos_top' => 60],
                ['label' => 'E4', 'pos_left' => 40, 'pos_top' => 220],
                ['label' => 'E5', 'pos_left' => 200, 'pos_top' => 220],
                ['label' => 'E6', 'pos_left' => 360, 'pos_top' => 220],
            ];

            foreach ($tables as $table) {
                $salleFetes->tables()->create([
                    'type' => 'table',
                    'label' => $table['label'],
                    'pos_left' => $table['pos_left'],
                    'pos_top' => $table['pos_top'],
                    'width' => 100,
                    'height' => 100,
                ]);
            }
        }
    }

    private function seedClients(): void
    {
        $defs = [
            ['firstname' => 'Marie', 'lastname' => 'Dupont', 'email' => 'marie.dupont@example.test', 'phone' => '0470000001'],
            ['firstname' => 'Jean', 'lastname' => 'Lefevre', 'email' => 'jean.lefevre@example.test', 'phone' => '0470000002'],
            ['firstname' => 'Claire', 'lastname' => 'Martin', 'email' => 'claire.martin@example.test', 'phone' => '0470000003'],
            ['firstname' => 'Paul', 'lastname' => 'Rousseau', 'email' => null, 'phone' => '0470000004'],
            ['firstname' => 'Julie', 'lastname' => 'Fontaine', 'email' => 'julie.fontaine@example.test', 'phone' => null],
            ['firstname' => 'Antoine', 'lastname' => 'Bernard', 'email' => 'antoine.bernard@example.test', 'phone' => '0470000005'],
            ['firstname' => 'Emma', 'lastname' => 'Petit', 'email' => 'emma.petit@example.test', 'phone' => '0470000006'],
            ['firstname' => 'Lucas', 'lastname' => 'Simon', 'email' => null, 'phone' => '0470000007'],
            ['firstname' => 'Léa', 'lastname' => 'Michel', 'email' => 'lea.michel@example.test', 'phone' => '0470000008'],
            ['firstname' => 'Hugo', 'lastname' => 'Garcia', 'email' => 'hugo.garcia@example.test', 'phone' => null],
            ['firstname' => 'Camille', 'lastname' => 'Roux', 'email' => 'camille.roux@example.test', 'phone' => '0470000009'],
            ['firstname' => 'Nicolas', 'lastname' => 'Girard', 'email' => null, 'phone' => '0470000010'],
        ];

        foreach ($defs as $def) {
            Client::query()->firstOrCreate(
                ['firstname' => $def['firstname'], 'lastname' => $def['lastname']],
                $def,
            );
        }
    }

    private function seedProducts(): void
    {
        $taxes = Tax::query()->get()->keyBy('slug');
        $stations = Station::query()->get()->keyBy('slug');
        $categories = ProductCategory::query()->get()->keyBy('name');
        $catalog = ProductCatalog::query()->where('slug', Str::slug('Catalogue de base'))->first();

        // Taux belges (voir TaxSeeder) : 12% pour la nourriture (HORECA), 21% pour les boissons
        // alcoolisées. Deux stations seulement (voir StationSeeder) : tout ce qui se prépare en
        // cuisine part sur 'cuisine', tout ce qui se sert directement part sur 'bar'.
        $defs = [
            'Entrées' => [
                ['Salade César', 7.50, 'tva-12', 'cuisine'],
                ["Soupe à l'oignon", 6.00, 'tva-12', 'cuisine'],
                ['Assiette de charcuterie', 9.00, 'tva-12', 'cuisine'],
                ['Croquettes de fromage (x3)', 8.00, 'tva-12', 'cuisine'],
                ['Salade de chèvre chaud', 8.50, 'tva-12', 'cuisine'],
                ['Carpaccio de bœuf', 10.50, 'tva-12', 'cuisine'],
                ['Tomate-mozzarella', 7.00, 'tva-12', 'cuisine'],
            ],
            'Plats' => [
                ['Steak-frites', 16.50, 'tva-12', 'cuisine'],
                ['Saumon grillé', 18.00, 'tva-12', 'cuisine'],
                ['Burger maison', 14.00, 'tva-12', 'cuisine'],
                ['Pâtes carbonara', 13.50, 'tva-12', 'cuisine'],
                ['Vol-au-vent', 15.50, 'tva-12', 'cuisine'],
                ['Moules-frites', 19.00, 'tva-12', 'cuisine'],
                ['Escalope à la crème', 15.00, 'tva-12', 'cuisine'],
                ['Lasagnes maison', 13.00, 'tva-12', 'cuisine'],
                ['Poulet rôti, gratin dauphinois', 16.00, 'tva-12', 'cuisine'],
                ['Risotto aux champignons', 14.50, 'tva-12', 'cuisine'],
            ],
            'Desserts' => [
                ['Tarte tatin', 6.50, 'tva-12', 'cuisine'],
                ['Mousse au chocolat', 5.50, 'tva-12', 'cuisine'],
                ['Crème brûlée', 6.00, 'tva-12', 'cuisine'],
                ['Tiramisu', 6.00, 'tva-12', 'cuisine'],
                ['Gaufre de Liège', 5.00, 'tva-12', 'cuisine'],
                ['Coupe de glace (3 boules)', 6.50, 'tva-12', 'cuisine'],
            ],
            'Boissons chaudes' => [
                ['Café', 2.00, 'tva-12', 'bar'],
                ['Thé', 2.50, 'tva-12', 'bar'],
                ['Cappuccino', 3.00, 'tva-12', 'bar'],
                ['Chocolat chaud', 3.00, 'tva-12', 'bar'],
            ],
            'Boissons froides' => [
                ['Coca-Cola', 3.00, 'tva-12', 'bar'],
                ['Eau minérale', 2.50, 'tva-12', 'bar'],
                ["Jus d'orange", 3.50, 'tva-12', 'bar'],
                ['Ice Tea', 3.00, 'tva-12', 'bar'],
                ['Fanta', 3.00, 'tva-12', 'bar'],
                ['Eau pétillante', 2.50, 'tva-12', 'bar'],
            ],
            'Vins & Bières' => [
                ['Verre de vin rouge', 4.50, 'tva-21', 'bar'],
                ['Verre de vin blanc', 4.50, 'tva-21', 'bar'],
                ['Verre de vin rosé', 4.50, 'tva-21', 'bar'],
                ['Bière pression 25cl', 4.00, 'tva-21', 'bar'],
                ['Bière pression 50cl', 6.50, 'tva-21', 'bar'],
                ['Bière trappiste 33cl', 5.50, 'tva-21', 'bar'],
                ['Bière kriek 25cl', 4.50, 'tva-21', 'bar'],
            ],
            'Snacking' => [
                ['Frites', 4.00, 'tva-12', 'cuisine'],
                ['Croque-monsieur', 7.00, 'tva-12', 'cuisine'],
                ['Mini croquettes (x6)', 6.50, 'tva-12', 'cuisine'],
                ['Assiette de fromages', 9.50, 'tva-12', 'cuisine'],
                ['Planche apéro', 12.00, 'tva-12', 'cuisine'],
                ['Nachos, sauce fromagère', 8.00, 'tva-12', 'cuisine'],
            ],
        ];

        foreach ($defs as $categoryName => $items) {
            $category = $categories->get($categoryName);

            foreach ($items as [$name, $price, $taxSlug, $stationSlug]) {
                $product = Product::query()->firstOrCreate(
                    ['slug' => Str::slug($name)],
                    [
                        'name' => $name,
                        'price' => $price,
                        'active' => true,
                        'product_category_id' => $category?->id,
                        'tax_id' => $taxes->get($taxSlug)?->id,
                        'station_id' => $stations->get($stationSlug)?->id,
                    ],
                );

                // Many-to-many désormais (voir Product::catalogs()) : syncWithoutDetaching plutôt
                // qu'une simple FK, un produit de démo peut appartenir à plusieurs catalogues.
                if ($catalog) {
                    $product->catalogs()->syncWithoutDetaching([$catalog->id]);
                }
            }
        }
    }

    /** Quelques events avec plusieurs dates chacun (passées ET futures), places vendues et validées pour les dates passées. */
    private function seedEvents(): void
    {
        if (Event::query()->exists()) {
            return;
        }

        $salleFetes = Room::query()->where('slug', Str::slug('Salle des fêtes'))->first();
        $clients = Client::query()->get();

        $defs = [
            'Concert de Jazz' => [
                ['offsetDays' => -18, 'start_hour' => '20:00', 'limit' => 60],
                ['offsetDays' => 14, 'start_hour' => '20:00', 'limit' => 60],
                ['offsetDays' => 45, 'start_hour' => '20:00', 'limit' => 60],
            ],
            'Soirée Quiz' => [
                ['offsetDays' => -32, 'start_hour' => '19:30', 'limit' => 40],
                ['offsetDays' => 21, 'start_hour' => '19:30', 'limit' => 40],
            ],
            'Réveillon' => [
                ['offsetDays' => 150, 'start_hour' => '20:00', 'limit' => 80],
            ],
        ];

        foreach ($defs as $eventName => $dates) {
            // HasSlug génère le slug via l'événement Eloquent `creating` — désactivé pour toute
            // la durée de ce seeder par `WithoutModelEvents` (voir docblock de classe), donc
            // fourni explicitement ici plutôt que compté dessus.
            $event = Event::query()->create(['name' => $eventName, 'slug' => Str::slug($eventName)]);

            foreach ($dates as $dateDef) {
                $eventDate = $event->dates()->create([
                    'date' => now()->addDays($dateDef['offsetDays'])->toDateString(),
                    'start_hour' => $dateDef['start_hour'],
                    'room_id' => $salleFetes?->id,
                    'number_place_limit' => $dateDef['limit'],
                ]);

                $isPast = $dateDef['offsetDays'] < 0;
                $ticketCount = random_int(5, min(15, $dateDef['limit']));

                for ($i = 0; $i < $ticketCount; $i++) {
                    $eventDate->tickets()->create([
                        'client_id' => $clients->random()->id,
                        'validation_code' => $this->uniqueEventValidationCode(),
                        'validated_at' => $isPast
                            ? now()->addDays($dateDef['offsetDays'])->addMinutes(random_int(0, 90))
                            : null,
                    ]);
                }
            }
        }
    }

    private function uniqueEventValidationCode(): string
    {
        do {
            $code = Str::upper(Str::random(8));
        } while (EventTicket::query()->where('validation_code', $code)->exists());

        return $code;
    }

    /** Réservations passées (validées, comme un client déjà venu) et à venir (pas encore validées). */
    private function seedBookings(): void
    {
        if (Booking::query()->exists()) {
            return;
        }

        $clients = Client::query()->get();
        $hoursByType = [
            'breakfast' => ['08:00', '08:30', '09:00'],
            'lunch' => ['12:00', '12:30', '13:00'],
            'dinner' => ['19:00', '19:30', '20:00', '20:30'],
        ];
        $types = array_keys($hoursByType);

        for ($i = 0; $i < 20; $i++) {
            $offsetDays = random_int(-15, 20);
            $type = $types[array_rand($types)];
            $hours = $hoursByType[$type];

            Booking::query()->create([
                'client_id' => $clients->random()->id,
                'number_of_guests' => random_int(2, 8),
                'type' => $type,
                'date' => now()->addDays($offsetDays)->toDateString(),
                'hour' => $hours[array_rand($hours)],
                'validated_at' => $offsetDays < 0 ? now()->addDays($offsetDays)->addMinutes(random_int(0, 30)) : null,
            ]);
        }
    }

    /**
     * Sessions de caisse ("shifts") + 50 tickets répartis sur les 4 sources possibles (voir
     * Readme.md : "Champ `source` sur les tickets"), rattachés à ces sessions, puis clôture de
     * toutes les sessions sauf la plus récente (reste ouverte, pour tester "caisse déjà ouverte"
     * au chargement du POS). Chaque ticket a un total de lignes cohérent avec la somme de ses
     * paiements (parfois scindés sur deux moyens de paiement) — même garde-fou que
     * TicketController::store/OrderController::pay, jamais vérifié ici puisqu'on écrit
     * directement en base plutôt que de passer par les contrôleurs. Clôture reprenant la même
     * logique que CashSessionController::close (comptage espèces obligatoire, écart parfois non
     * nul pour tester son affichage).
     */
    private function seedTickets(): void
    {
        if (Ticket::query()->exists()) {
            return;
        }

        $products = Product::query()->get();
        $paymentMethods = PaymentMethod::query()->get();
        $cashMethod = $paymentMethods->firstWhere('slug', 'especes');
        $staff = User::query()->where('username', '!=', 'admin')->get();
        $clients = Client::query()->get();

        $restaurantTables = TableElement::query()
            ->whereHas('room', fn ($query) => $query->whereIn('slug', [Str::slug('Salle principale'), Str::slug('Terrasse')]))
            ->get();

        // Une session par "shift" plutôt qu'une par ticket — les tickets piochent une session
        // existante et empruntent sa plage horaire, comme dans l'app où un paiement est toujours
        // rattaché à la session ouverte de son caissier. La session d'indice 0 (aujourd'hui)
        // reste volontairement ouverte, les autres seront clôturées en fin de méthode.
        $sessions = collect();
        for ($i = 0; $i < 12; $i++) {
            $dayOffset = $i === 0 ? 0 : random_int(1, 40);

            $sessions->push(CashSession::query()->create([
                'user_id' => $staff->random()->id,
                'opening_amount' => [100, 150, 200][array_rand([100, 150, 200])],
                'opened_at' => now()->subDays($dayOffset)->setTime(11, random_int(0, 45)),
            ]));
        }

        $sourceCounts = [
            'pos_vente_directe' => 13,
            'pos_restaurant' => 13,
            'self_order' => 12,
            'kiosk' => 12,
        ];

        foreach ($sourceCounts as $source => $count) {
            for ($i = 0; $i < $count; $i++) {
                $session = $sessions->random();
                $paidAt = $session->opened_at->copy()->addMinutes(random_int(5, 420));

                $hasClient = in_array($source, ['pos_vente_directe', 'pos_restaurant'], true) && random_int(1, 100) <= 50;
                $hasTable = in_array($source, ['pos_restaurant', 'self_order'], true) && $restaurantTables->isNotEmpty();
                $table = $hasTable ? $restaurantTables->random() : null;

                $ticket = Ticket::query()->create([
                    'paid_at' => $paidAt,
                    'client_id' => $hasClient ? $clients->random()->id : null,
                    'table_id' => $table?->id,
                    'source' => $source,
                ]);

                $sectionName = match ($source) {
                    'pos_vente_directe' => 'Vente directe',
                    'pos_restaurant' => 'Section 1',
                    'self_order' => 'Table ' . ($table->label ?? '?'),
                    'kiosk' => 'Kiosque',
                };

                $section = $ticket->sections()->create(['name' => $sectionName]);

                $total = 0;
                foreach (range(1, random_int(1, 5)) as $ignored) {
                    $product = $products->random();
                    $quantity = random_int(1, 3);

                    $section->lines()->create([
                        'quantity' => $quantity,
                        'unit_price' => $product->price,
                        'product_id' => $product->id,
                    ]);

                    $total += (float) $product->price * $quantity;
                }

                // ~20% des tickets : paiement scindé sur deux moyens, pour exercer l'affichage
                // multi-paiement du reçu (voir ticket-print.util.ts).
                if ($paymentMethods->count() > 1 && random_int(1, 100) <= 20) {
                    $methods = $paymentMethods->random(2)->values();
                    $firstValue = round($total * (random_int(30, 70) / 100), 2);

                    TicketPayment::query()->create([
                        'value' => $firstValue,
                        'payment_method_id' => $methods[0]->id,
                        'ticket_id' => $ticket->id,
                        'user_id' => $session->user_id,
                        'cash_session_id' => $session->id,
                    ]);
                    TicketPayment::query()->create([
                        'value' => round($total - $firstValue, 2),
                        'payment_method_id' => $methods[1]->id,
                        'ticket_id' => $ticket->id,
                        'user_id' => $session->user_id,
                        'cash_session_id' => $session->id,
                    ]);
                } else {
                    TicketPayment::query()->create([
                        'value' => round($total, 2),
                        'payment_method_id' => $paymentMethods->random()->id,
                        'ticket_id' => $ticket->id,
                        'user_id' => $session->user_id,
                        'cash_session_id' => $session->id,
                    ]);
                }
            }
        }

        foreach ($sessions as $index => $session) {
            if ($index === 0) {
                continue;
            }

            $usedMethodIds = TicketPayment::query()
                ->where('cash_session_id', $session->id)
                ->distinct()
                ->pluck('payment_method_id')
                ->push($cashMethod->id)
                ->unique();

            $cashCount = null;

            foreach ($usedMethodIds as $methodId) {
                $expected = (float) TicketPayment::query()
                    ->where('cash_session_id', $session->id)
                    ->where('payment_method_id', $methodId)
                    ->sum('value');

                $isCash = $methodId === $cashMethod->id;
                if ($isCash) {
                    $expected += (float) $session->opening_amount;
                }

                // ~15% des comptages : petit écart de caisse, pour tester son affichage dans
                // l'historique — sinon compte rond (0 écart).
                $discrepancyTarget = random_int(1, 100) <= 15 ? random_int(-500, 500) / 100 : 0.0;
                $counted = round($expected + $discrepancyTarget, 2);

                $count = $session->counts()->create([
                    'payment_method_id' => $methodId,
                    'expected_amount' => round($expected, 2),
                    'counted_amount' => $counted,
                    'discrepancy' => round($counted - $expected, 2),
                ]);

                if ($isCash) {
                    $cashCount = $count;
                }
            }

            $session->forceFill([
                'closing_amount' => $cashCount->counted_amount,
                'expected_amount' => $cashCount->expected_amount,
                'discrepancy' => $cashCount->discrepancy,
                'closed_at' => $session->opened_at->copy()->addHours(8),
                'closed_by_user_id' => $session->user_id,
            ])->save();
        }
    }
}
