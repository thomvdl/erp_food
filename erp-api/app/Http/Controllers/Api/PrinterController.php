<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Printer;
use Illuminate\Http\Request;

class PrinterController extends Controller
{
    public function index()
    {
        return Printer::query()->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        return response()->json(Printer::query()->create($this->validated($request)), 201);
    }

    public function show(Printer $printer)
    {
        return $printer;
    }

    public function update(Request $request, Printer $printer)
    {
        $printer->update($this->validated($request));

        return $printer;
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'ip_address' => ['required', 'ip'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'chars_per_line' => ['nullable', 'integer', 'min:20', 'max:64'],
            'active' => ['boolean'],
        ]);
    }
}
