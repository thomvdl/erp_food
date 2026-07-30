<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\UserQrCodeMail;
use App\Models\User;
use App\Support\Qr;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    public function index()
    {
        return User::query()->with('roles')->orderBy('username')->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request, null);
        $roleIds = $data['role_ids'] ?? [];
        unset($data['role_ids']);

        $user = User::query()->create($data);
        $user->roles()->sync($roleIds);

        return response()->json($user->load('roles'), 201);
    }

    public function show(User $user)
    {
        return $user->load('roles');
    }

    public function update(Request $request, User $user)
    {
        $data = $this->validated($request, $user);
        $roleIds = $data['role_ids'] ?? [];
        unset($data['role_ids']);

        // Mot de passe optionnel à l'édition : laisser le champ vide ne réinitialise pas le
        // mot de passe existant (même convention que ERP/erp-api/UserController).
        if (empty($data['password'])) {
            unset($data['password']);
        }

        $user->update($data);
        $user->roles()->sync($roleIds);

        return $user->load('roles');
    }

    /**
     * "Possibilité de créer un QR code par user" (voir Readme.md) : (re)génère le secret encodé
     * dans le QR de connexion de cet utilisateur — réutilise `barcode` (colonne déjà présente,
     * unique, jamais utilisée jusqu'ici) plutôt que d'ajouter une colonne dédiée. Régénérer
     * invalide l'ancien QR imprimé/affiché (utile en cas de perte).
     */
    public function generateQrCode(User $user)
    {
        do {
            $code = Str::upper(Str::random(13));
        } while (User::query()->where('barcode', $code)->exists());

        $user->forceFill(['barcode' => $code])->save();

        return $user->load('roles');
    }

    /**
     * PNG du QR de connexion actuel — 404 si aucun n'a encore été généré. Même pattern que
     * EventTicketController::qr (endroid/qr-code via App\Support\Qr, pas de détour JSON/base64).
     */
    public function qr(User $user)
    {
        abort_if(!$user->barcode, 404);

        return response(Qr::png($user->barcode), 200, ['Content-Type' => 'image/png']);
    }

    /**
     * "Possibilité d'envoyer le qrcode de l'utilisateur par email" (voir Readme.md).
     */
    public function sendQrEmail(User $user)
    {
        if (!$user->barcode) {
            throw ValidationException::withMessages([
                'barcode' => ['Génère un QR code avant de pouvoir l\'envoyer par email.'],
            ]);
        }

        Mail::to($user->email)->send(new UserQrCodeMail($user));

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?User $user): array
    {
        return $request->validate([
            'username' => ['required', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user?->id)],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user?->id)],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8'],
            'active' => ['boolean'],
            'role_ids' => ['array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
        ]);
    }
}
