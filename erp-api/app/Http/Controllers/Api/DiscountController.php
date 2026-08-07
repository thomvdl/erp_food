<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Discount;
use App\Models\Product;
use App\Support\DiscountCalculator;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DiscountController extends Controller
{
    private const WITH = ['freeProduct'];

    public function index()
    {
        return Discount::query()->with(self::WITH)->orderBy('code')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request, null);

        return response()->json(Discount::query()->create($data)->load(self::WITH), 201);
    }

    public function show(Discount $discount)
    {
        return $discount->load(self::WITH);
    }

    public function update(Request $request, Discount $discount)
    {
        $data = $this->validated($request, $discount);

        $discount->update($data);

        return $discount->load(self::WITH);
    }

    /**
     * Aperçu live d'un code avant paiement (voir *.ts côté front — pos-vente, order-builder,
     * kiosk-order) : ne fait rien d'irréversible, juste résoudre le code et calculer le montant
     * qu'il déduirait pour le panier actuel. Le paiement réel (TicketController::store,
     * OrderController::pay, KioskOrderController::store) refait exactement ce calcul de son
     * côté — cet endpoint est un confort d'affichage, pas une source de vérité.
     */
    public function validateCode(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        $discount = DiscountCalculator::resolve($data['code']);
        $products = Product::query()->whereIn('id', collect($data['lines'])->pluck('product_id'))->get()->keyBy('id');

        $lines = collect($data['lines'])->map(fn (array $line) => [
            'product_id' => $line['product_id'],
            'quantity' => $line['quantity'],
            'unit_price' => (float) $products[$line['product_id']]->price,
        ])->all();

        $total = array_sum(array_map(fn (array $line) => $line['unit_price'] * $line['quantity'], $lines));
        $amountOff = DiscountCalculator::amountOff($discount, $lines, $total);

        return response()->json([
            'discount' => $discount->load(self::WITH),
            'amount_off' => round($amountOff, 2),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Discount $discount): array
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('discounts', 'code')->ignore($discount?->id)],
            'type' => ['required', 'string', 'in:percentage,fixed_amount,free_product'],
            'value' => ['nullable', 'numeric', 'min:0'],
            // Seuil d'éligibilité optionnel (montant d'achat minimum requis) — voir
            // DiscountCalculator::amountOff, pas un plafond qui réduirait la réduction.
            'minimum_total' => ['nullable', 'numeric', 'min:0'],
            'free_product_id' => ['nullable', 'integer', 'exists:products,id'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after_or_equal:starts_at'],
            'active' => ['boolean'],
        ]);

        if (in_array($data['type'], ['percentage', 'fixed_amount'], true) && !isset($data['value'])) {
            throw ValidationException::withMessages(['value' => ['Une valeur est requise pour ce type de réduction.']]);
        }

        if ($data['type'] === 'percentage' && ($data['value'] ?? 0) > 100) {
            throw ValidationException::withMessages(['value' => ['Un pourcentage ne peut pas dépasser 100.']]);
        }

        if ($data['type'] === 'free_product' && empty($data['free_product_id'])) {
            throw ValidationException::withMessages(['free_product_id' => ['Choisis le produit offert par ce code.']]);
        }

        return $data;
    }
}
