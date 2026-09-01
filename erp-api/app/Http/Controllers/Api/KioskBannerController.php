<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KioskBanner;
use App\Support\ImageUpload;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class KioskBannerController extends Controller
{
    public function index()
    {
        return KioskBanner::query()->orderBy('position')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        // Sans position fournie, la bannière part en dernière position plutôt qu'en tête (0) —
        // voir ProductCategoryController::store, même pattern.
        $data['position'] ??= (int) KioskBanner::query()->max('position') + 1;

        return response()->json(KioskBanner::query()->create($data), 201);
    }

    public function show(KioskBanner $kioskBanner)
    {
        return $kioskBanner;
    }

    public function update(Request $request, KioskBanner $kioskBanner)
    {
        $kioskBanner->update($this->validated($request));

        return $kioskBanner;
    }

    // Pas de désactivation-only ici (contrairement à product-categories/product-catalogs) : une
    // bannière n'est référencée par aucune autre entité, la suppression réelle ne présente pas le
    // risque de cascade qui a motivé ->except(['destroy']) ailleurs (voir routes/api.php).
    public function destroy(KioskBanner $kioskBanner)
    {
        $kioskBanner->delete();

        return response()->noContent();
    }

    /** Voir ProductCategoryController::uploadImage — même principe, endpoint séparé du store/update JSON. */
    public function uploadImage(Request $request, KioskBanner $kioskBanner)
    {
        $request->validate(['image' => ['required', 'image', 'max:4096']]);
        ImageUpload::store($kioskBanner, $request->file('image'), 'kiosk-banners');

        return $kioskBanner->fresh();
    }

    public function removeImage(KioskBanner $kioskBanner)
    {
        ImageUpload::remove($kioskBanner);

        return $kioskBanner->fresh();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'integer', 'min:0'],
            'active' => ['boolean'],
            // Utilisé quand la bannière n'a pas d'image (voir image_url) — sans ça le fond serait
            // transparent.
            'background_color' => ['nullable', 'string', 'max:9'],
            'text_position' => ['nullable', Rule::in(['top', 'center', 'bottom'])],
            'text_size' => ['nullable', Rule::in(['small', 'medium', 'large'])],
        ]);
    }
}
