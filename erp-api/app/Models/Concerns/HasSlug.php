<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

trait HasSlug
{
    protected static function bootHasSlug(): void
    {
        static::creating(function ($model) {
            if (empty($model->slug)) {
                $model->slug = static::uniqueSlugFor($model->name);
            }
        });
    }

    /**
     * Ajoute un suffixe numérique (-2, -3, ...) si le slug généré existe déjà — sans ça, créer
     * deux enregistrements avec le même nom (ex. deux événements "Concert") plantait avec une
     * violation de contrainte unique SQL non gérée (500) plutôt qu'une erreur propre.
     */
    protected static function uniqueSlugFor(string $name): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 2;

        while (static::query()->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
