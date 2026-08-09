<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Param;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ParamController extends Controller
{
    public function index()
    {
        return Param::query()->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request, null);

        return response()->json(Param::query()->create($data), 201);
    }

    public function show(Param $param)
    {
        return $param;
    }

    public function update(Request $request, Param $param)
    {
        $data = $this->validated($request, $param);

        $param->update($data);

        return $param;
    }

    public function destroy(Param $param)
    {
        $param->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Param $param): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('params', 'name')->ignore($param?->id)],
            'value' => ['nullable', 'string', 'max:255'],
        ]);
    }
}
