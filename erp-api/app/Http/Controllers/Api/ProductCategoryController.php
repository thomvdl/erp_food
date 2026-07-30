<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductCategory;
use Illuminate\Http\Request;

class ProductCategoryController extends Controller
{
    public function index()
    {
        return ProductCategory::query()->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'active' => ['boolean'],
        ]);

        return response()->json(ProductCategory::query()->create($data), 201);
    }

    public function show(ProductCategory $productCategory)
    {
        return $productCategory;
    }

    public function update(Request $request, ProductCategory $productCategory)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'active' => ['boolean'],
        ]);

        $productCategory->update($data);

        return $productCategory;
    }
}
