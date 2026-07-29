<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['cash_session_id', 'payment_method_id', 'expected_amount', 'counted_amount', 'discrepancy'])]
class CashSessionCount extends Model
{
    protected function casts(): array
    {
        return [
            'expected_amount' => 'decimal:2',
            'counted_amount' => 'decimal:2',
            'discrepancy' => 'decimal:2',
        ];
    }

    public function cashSession(): BelongsTo
    {
        return $this->belongsTo(CashSession::class);
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }
}
