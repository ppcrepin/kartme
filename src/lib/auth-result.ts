/**
 * Le résultat d'une tentative d'authentification : `null` = c'est passé.
 *
 * Sorti de `lib/auth` pour que les modules scindés par plateforme
 * (`apple-auth.ts` / `apple-auth.web.ts`) puissent le typer sans importer le
 * fournisseur React — ce qui créerait un cycle.
 */
export type AuthResult = { error: string | null };
