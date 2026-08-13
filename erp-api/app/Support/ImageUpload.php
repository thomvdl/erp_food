<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Upload/suppression d'image pour tout modèle avec un champ `image_path` (Product,
 * ProductCategory, Event...) — première fonctionnalité d'upload de fichier de ce projet.
 * Toujours sur le disque `public` (le seul servi publiquement, voir config/filesystems.php),
 * jamais `local`. Sur les modèles qui ont aussi un `icon` (Product, ProductCategory), les deux
 * champs sont mutuellement exclusifs : uploader une image efface toujours l'icône choisie — pas
 * l'inverse ici, un `icon` choisi via le formulaire normal (JSON, voir ProductController::validated)
 * écrase `image_path` séparément côté contrôleur (clearIfIconChosen ci-dessous). `isFillable('icon')`
 * garde `store()` utilisable tel quel sur un modèle sans ce champ (ex. Event) sans lever de
 * MassAssignmentException.
 */
class ImageUpload
{
    public static function store(Model $model, UploadedFile $file, string $directory): void
    {
        self::deleteFile($model);
        $data = ['image_path' => $file->store($directory, 'public')];
        if ($model->isFillable('icon')) {
            $data['icon'] = null;
        }
        $model->update($data);
    }

    public static function remove(Model $model): void
    {
        self::deleteFile($model);
        $model->update(['image_path' => null]);
    }

    /**
     * Choisir une icône (formulaire JSON normal, voir ProductController::update) remplace une
     * éventuelle image existante — supprime le fichier devenu orphelin plutôt que de le laisser
     * traîner sur le disque sans plus jamais être référencé. Ne fait rien si `$icon` est vide
     * (ne PAS effacer une image existante juste parce que le champ icône n'a pas été touché) ni
     * si le modèle n'a pas d'image à effacer.
     *
     * @return array<string, mixed> à fusionner dans les données à sauvegarder (vide si rien à faire)
     */
    public static function clearIfIconChosen(Model $model, ?string $icon): array
    {
        if (!$icon || !$model->image_path) {
            return [];
        }

        self::deleteFile($model);

        return ['image_path' => null];
    }

    private static function deleteFile(Model $model): void
    {
        if ($model->image_path) {
            Storage::disk('public')->delete($model->image_path);
        }
    }
}
