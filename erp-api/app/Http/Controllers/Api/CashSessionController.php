<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashSession;
use App\Models\PaymentMethod;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CashSessionController extends Controller
{
    private const WITH = ['user', 'closedBy'];

    public function index(Request $request)
    {
        return CashSession::query()
            ->with(self::WITH)
            ->when($request->query('user_id'), fn ($query, $userId) => $query->where('user_id', $userId))
            ->latest('opened_at')
            ->get();
    }

    /**
     * Session ouverte de l'utilisateur donné, s'il y en a une — utilisé au chargement du module
     * Caisse et par le POS pour savoir à quelle session rattacher les paiements (voir Readme.md :
     * "valider les paiements par utilisateur"). Pas d'auth dans ce projet, donc 'user_id' vient
     * du sélecteur d'utilisateur côté front, pas d'une session serveur.
     */
    public function active(Request $request)
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $session = CashSession::query()
            ->with(self::WITH)
            ->where('user_id', $data['user_id'])
            ->whereNull('closed_at')
            ->first();

        return response()->json($session);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'opening_amount' => ['required', 'numeric', 'min:0'],
        ]);

        $alreadyOpen = CashSession::query()->where('user_id', $data['user_id'])->whereNull('closed_at')->exists();

        if ($alreadyOpen) {
            throw ValidationException::withMessages([
                'user_id' => ['Cet utilisateur a déjà une caisse ouverte.'],
            ]);
        }

        $session = CashSession::query()->create([
            'user_id' => $data['user_id'],
            'opening_amount' => $data['opening_amount'],
            'opened_at' => now(),
        ]);

        return response()->json($session->load(self::WITH), 201);
    }

    public function show(CashSession $cashSession)
    {
        return $cashSession->load([...self::WITH, 'payments.paymentMethod', 'payments.user', 'payments.ticket', 'counts.paymentMethod']);
    }

    /**
     * "Ouvrir la caisse pour les espèces mais fermer et vérifier tous les moyens de paiement"
     * (voir Readme.md) : l'ouverture ne porte que sur le fond en espèces (voir store()), mais la
     * fermeture demande un comptage pour CHAQUE moyen de paiement utilisé — pas seulement les
     * espèces — afin de vérifier que les paiements carte/chèques-repas/etc. encaissés
     * correspondent bien à ce qui a été compté (relevé du terminal, etc.).
     *
     * Une ligne CashSessionCount est créée par moyen de paiement fourni. Pour les espèces
     * uniquement, l'attendu inclut le fond d'ouverture ; pour les autres, l'attendu est
     * seulement la somme des paiements de la session. Les 3 colonnes historiques sur
     * cash_sessions (closing_amount/expected_amount/discrepancy) restent le résumé "espèces"
     * pour ne pas casser l'affichage existant de l'historique/liste.
     */
    public function close(Request $request, CashSession $cashSession)
    {
        if ($cashSession->closed_at !== null) {
            throw ValidationException::withMessages([
                'counts' => ['Cette caisse est déjà fermée.'],
            ]);
        }

        $data = $request->validate([
            'counts' => ['required', 'array', 'min:1'],
            'counts.*.payment_method_id' => ['required', 'distinct', 'integer', 'exists:payment_methods,id'],
            'counts.*.counted_amount' => ['required', 'numeric', 'min:0'],
            'note' => ['nullable', 'string'],
        ]);

        $cashMethodId = PaymentMethod::query()->where('slug', 'especes')->value('id');
        $cashEntry = collect($data['counts'])->firstWhere('payment_method_id', $cashMethodId);

        if (!$cashEntry) {
            throw ValidationException::withMessages([
                'counts' => ['Le comptage des espèces est obligatoire à la fermeture.'],
            ]);
        }

        $cashCount = null;

        foreach ($data['counts'] as $entry) {
            $expected = (float) $cashSession->payments()->where('payment_method_id', $entry['payment_method_id'])->sum('value');
            $isCash = $entry['payment_method_id'] === $cashMethodId;

            if ($isCash) {
                $expected += (float) $cashSession->opening_amount;
            }

            $count = $cashSession->counts()->create([
                'payment_method_id' => $entry['payment_method_id'],
                'expected_amount' => $expected,
                'counted_amount' => $entry['counted_amount'],
                'discrepancy' => $entry['counted_amount'] - $expected,
            ]);

            if ($isCash) {
                $cashCount = $count;
            }
        }

        $cashSession->forceFill([
            'closing_amount' => $cashCount->counted_amount,
            'expected_amount' => $cashCount->expected_amount,
            'discrepancy' => $cashCount->discrepancy,
            'closed_at' => now(),
            'closed_by_user_id' => $cashSession->user_id,
            'note' => $data['note'] ?? null,
        ])->save();

        return $cashSession->load([...self::WITH, 'counts.paymentMethod']);
    }
}
